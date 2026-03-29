// src/services/documento.service.js
import fs from "fs";
import { permRepo } from "../repositories/permRepo.js";
import { pool } from "../db/pool.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { plantillaRepo } from "../repositories/plantillaRepo.js";
import { comentarioRepo } from "../repositories/comentariosRepo.js"; // shim
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { documentMetadataService } from "./documentMetadata.service.js";
import { userRepo } from "../repositories/userRepo.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { documentoAnexoRepo } from "../repositories/documentoAnexoRepo.js";

import mammoth from "mammoth";
import { rutaWebToFs } from "../utils/path.js";
import { notificacionService } from "./notificacion.service.js";
import { pdfService } from "./pdf.service.js";
import { wordService } from "./word.service.js";
import crypto from "crypto";
import { indiceService } from "./indice.service.js";


/** Helpers */
function pad2(n) {
    return String(n).padStart(2, "0");
}

function tmpSerie() {
    const d = new Date(),
        r = Math.floor(Math.random() * 9000) + 1000;
    return `TMP-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(
        d.getDate()
    )}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${r}`;
}

function officialIndex(docId) {
    const y = new Date().getFullYear();
    return `OFI_MNCR-DAF-AC-${docId}-${y}`;
}

function normalizeKeywordsFromAny(value) {
    if (Array.isArray(value)) {
        return value
            .map((v) => String(v || "").trim())
            .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
        return value
            .split(/[;,]/)
            .map((v) => v.trim())
            .filter(Boolean);
    }
    return [];
}

function inferPreliminaryClass(text) {
    const src = String(text || "").toLowerCase();
    if (!src) return "";
    if (src.includes("contrato")) return "CONTRATO";
    if (src.includes("resolucion")) return "RESOLUCION";
    if (src.includes("acta")) return "ACTA";
    if (src.includes("informe")) return "INFORME";
    if (src.includes("oficio")) return "OFICIO";
    if (src.includes("circular")) return "CIRCULAR";
    if (src.includes("memorando") || src.includes("memo")) return "MEMORANDO";
    return "";
}

function inferClassificationCode(text) {
    const src = String(text || "");
    if (!src) return "";
    const match = src.match(/\b[A-Z]{2,10}(?:[-_]\d{1,6}){1,4}\b/);
    if (!match) return "";
    return String(match[0]).replace(/_/g, "-");
}

function inferKeywordsFromTitle(title = "") {
    const stopwords = new Set([
        "de",
        "del",
        "la",
        "el",
        "los",
        "las",
        "y",
        "en",
        "para",
        "por",
        "con",
        "sin",
        "a",
    ]);
    const words = String(title || "")
        .toLowerCase()
        .split(/[^a-zA-Z0-9áéíóúñü]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stopwords.has(w));
    return Array.from(new Set(words)).slice(0, 10);
}

function pickRawMetadataForFile({ file, fileIndex, metadataPorDocumento }) {
    if (!metadataPorDocumento) return {};

    if (Array.isArray(metadataPorDocumento)) {
        const byName = metadataPorDocumento.find((item) => {
            const name = String(
                item?.archivo || item?.fileName || item?.filename || item?.originalname || ""
            ).trim();
            return (
                name &&
                name.toLowerCase() === String(file?.originalname || "").trim().toLowerCase()
            );
        });
        if (byName) return byName;

        const byIndex = metadataPorDocumento.find((item) => Number(item?.index) === Number(fileIndex));
        if (byIndex) return byIndex;

        return metadataPorDocumento[fileIndex] || {};
    }

    if (typeof metadataPorDocumento === "object") {
        const key = String(file?.originalname || "").trim();
        if (key && metadataPorDocumento[key]) return metadataPorDocumento[key];
    }

    return {};
}

function buildMassiveMetadata({
    tituloBase,
    originalname,
    actorName,
    unidad_id,
    metadataLote = {},
    metadataDocumento = {},
}) {
    const base = {
        ...metadataLote,
        ...metadataDocumento,
    };

    const out = {
        title: String(base.title || tituloBase || "").trim(),
        keywords: normalizeKeywordsFromAny(base.keywords),
        preliminaryClass: String(base.preliminaryClass || "").trim(),
        classificationCode: String(base.classificationCode || "").trim(),
        author: String(base.author || actorName || "").trim(),
        responsibleUnitId:
            base.responsibleUnitId != null && String(base.responsibleUnitId).trim() !== ""
                ? Number(base.responsibleUnitId)
                : Number(unidad_id || 0) || null,
    };

    const detectedFields = [];
    if (!out.keywords.length) {
        out.keywords = inferKeywordsFromTitle(out.title);
        if (out.keywords.length) detectedFields.push("keywords");
    }

    if (!out.preliminaryClass) {
        out.preliminaryClass = inferPreliminaryClass(originalname || out.title);
        if (out.preliminaryClass) detectedFields.push("preliminaryClass");
    }

    if (!out.classificationCode) {
        out.classificationCode = inferClassificationCode(originalname || out.title);
        if (out.classificationCode) detectedFields.push("classificationCode");
    }

    return {
        ...out,
        detectedFields,
        editable: true,
    };
}

async function safeAudit({
                             fecha,
                             accion,
                             resultado,
                             usuario_id,
                             documento_id,
                             evento,
                             detalle,
                         }) {
    try {
        // Snapshot para que la bitácora no cambie si el documento se actualiza luego.
        let snapshot = {};
        if (documento_id != null) {
            // Best effort: intenta capturar snapshot incluso si falla Metadato.
            try {
                const doc = await documentoRepo.findById(documento_id);
                snapshot = {
                    documento_titulo: doc?.titulo ?? null,
                    documento_codigo_unico: doc?.numero_serie ?? null,
                    documento_estado: doc?.estado ?? null,
                    // se completa más abajo (CODIGO_OFICIAL)
                };
            } catch (_e) {
                snapshot = {};
            }

            try {
                const codigoOficial = await metadatoRepo.findByTipo({
                    documento_id,
                    tipo: "CODIGO_OFICIAL",
                });
                snapshot.documento_codigo_oficial = codigoOficial?.valor ?? null;
            } catch (_e) {
                snapshot.documento_codigo_oficial = null;
            }
        }

        const baseId = await bitacoraRepo.insertBase({
            fecha: fecha ?? new Date(),
            accion,
            resultado,
            usuario_id,
            documento_id: documento_id ?? null,
        });

        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: evento ?? "OTRO",
            detalle: JSON.stringify({ ...(detalle ?? {}), snapshot }),
        });

        return baseId;
    } catch (err) {
        console.warn("⚠️ Falló bitácora:", err.message);
        return null;
    }
}

/** Document service */
export const documentoService = {
    // ==========================================================
    // ✅ Acceso (helper)
    // ==========================================================
    async _assertHasAccess({ documento_id, usuario_id }) {
        const [acc] = await pool.query(
            `SELECT 1
             FROM VW_Documentos_Accesibles
             WHERE viewer_usuario_id = ? AND documento_id = ?
                 LIMIT 1`,
            [Number(usuario_id), Number(documento_id)]
        );
        if (!acc.length) {
            const e = new Error("Acceso no autorizado al documento");
            e.code = "FORBIDDEN";
            throw e;
        }
    },

    _safeDeleteFile(filePath) {
        try {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (e) {
            console.warn("⚠️ No se pudo borrar archivo temporal:", e.message);
        }
    },

    _buildSha256(buffer) {
        return crypto.createHash("sha256").update(buffer).digest("hex");
    },

    _pdfHasDigitalSignatureMarkers(buffer) {
        const raw = buffer.toString("latin1");

        const markers = [
            "/Type /Sig",
            "/ByteRange",
            "/Contents",
            "/SubFilter",
            "/Adobe.PPKLite",
            "/ETSI.CAdES.detached",
        ];

        const found = markers.filter((m) => raw.includes(m));
        return found.length >= 2;
    },

    async _findDocumentoByHash(hash) {
        const [rows] = await pool.query(
            `
                SELECT d.id, d.titulo, d.estado
                FROM Metadato m
                         JOIN Documento d ON d.id = m.documento_id
                WHERE m.tipo = 'FILE_HASH_SHA256'
                  AND m.valor = ?
                    LIMIT 1
            `,
            [String(hash)]
        );

        return rows[0] ?? null;
    },

    async importArchivedPdfs({
                                 files,
                                 usuario_id,
                                 unidad_id,
                                 categoria_id = null,
                                 origen_documento,
                                 metadata_por_documento = null,
                                 metadata_lote = null,
                             }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        if (!unidad_id) {
            const e = new Error("No se pudo determinar la unidad del usuario");
            e.code = "BAD_REQUEST";
            throw e;
        }

        if (!Array.isArray(files) || files.length === 0) {
            const e = new Error("Debe adjuntar al menos un PDF");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const origen = String(origen_documento || "").trim().toUpperCase();

        if (!["ESCANEADO", "ELECTRONICO"].includes(origen)) {
            const e = new Error("El origen del documento debe ser ESCANEADO o ELECTRONICO");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const actor = await userRepo.findById(usuario_id);
        const actorName = actor
            ? [actor.nombre, actor.apellido1, actor.apellido2].filter(Boolean).join(" ").trim()
            : "";

        const resultado = {
            ok: true,
            origen_documento: origen,
            total_recibidos: files.length,
            importados: [],
            rechazados: [],
        };

        const batchHashes = new Set();

        for (const [fileIndex, file] of files.entries()) {
            const filePath = file?.path;
            const originalname = file?.originalname || "documento.pdf";
            const ext = (originalname.split(".").pop() || "").toLowerCase();

            try {
                if (!filePath || !fs.existsSync(filePath)) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Archivo temporal no encontrado",
                    });
                    continue;
                }

                if (ext !== "pdf") {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Solo se permiten archivos PDF",
                    });
                    continue;
                }

                const buffer = fs.readFileSync(filePath);
                const hash = this._buildSha256(buffer);

                if (batchHashes.has(hash)) {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Documento duplicado dentro del mismo lote",
                    });
                    continue;
                }

                const duplicado = await this._findDocumentoByHash(hash);
                if (duplicado) {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Documento duplicado en el sistema",
                        documento_existente_id: duplicado.id,
                        documento_existente_titulo: duplicado.titulo,
                    });
                    continue;
                }

                // HU-20 simplificada:
                // se elimina validación/verificación automática de firmas digitales
                // en carga masiva de documentos externos.
                const verificacion_firma_estado = null;
                const detalle_validacion =
                    "Validación de firma digital deshabilitada para carga masiva.";
                const aplica_validacion_firma = "NO";

                const tituloBase = originalname.replace(/\.pdf$/i, "").trim() || "Documento importado";
                const metadataDocumento = pickRawMetadataForFile({
                    file,
                    fileIndex,
                    metadataPorDocumento: metadata_por_documento,
                });
                const metadata = buildMassiveMetadata({
                    tituloBase,
                    originalname,
                    actorName,
                    unidad_id,
                    metadataLote: metadata_lote || {},
                    metadataDocumento: metadataDocumento || {},
                });

                const nuevoDoc = await documentoRepo.create({
                    numero_serie: tmpSerie(),
                    titulo: metadata.title || tituloBase,
                    contenido: "",
                    contenido_hash: hash,
                    estado: "ARCHIVADO",
                    fecha: new Date(),
                    unidad_id,
                    usuario_id,
                    categoria_id: categoria_id ?? null,
                });

                // No se persiste estado de verificación de firma digital
                // porque esta validación fue retirada del flujo de carga masiva.

                await metadatoRepo.upsertByTipo({
                    documento_id: nuevoDoc.id,
                    tipo: "FILE_HASH_SHA256",
                    valor: hash,
                });

                await metadatoRepo.upsertByTipo({
                    documento_id: nuevoDoc.id,
                    tipo: "ORIGINAL_FILENAME",
                    valor: originalname,
                });

                await metadatoRepo.upsertByTipo({
                    documento_id: nuevoDoc.id,
                    tipo: "ORIGEN_DOCUMENTO",
                    valor: origen,
                });

                await metadatoRepo.upsertByTipo({
                    documento_id: nuevoDoc.id,
                    tipo: "APLICA_VALIDACION_FIRMA",
                    valor: aplica_validacion_firma,
                });

                await metadatoRepo.upsertByTipo({
                    documento_id: nuevoDoc.id,
                    tipo: "SOURCE_PDF_PATH",
                    valor: String(filePath),
                });

                // Se reutiliza esta metadata para poder abrir el PDF actual ya importado
                await metadatoRepo.upsertByTipo({
                    documento_id: nuevoDoc.id,
                    tipo: "SIGNED_PDF_CURRENT",
                    valor: String(filePath),
                });

                await metadatoRepo.upsertByTipo({
                    documento_id: nuevoDoc.id,
                    tipo: "FIRMA_VALIDACION_DETALLE",
                    valor: detalle_validacion,
                });

                await metadatoRepo.upsertMap(nuevoDoc.id, {
                    DESC_TITLE: metadata.title || tituloBase,
                    DESC_AUTHOR: metadata.author || "",
                    DESC_RESPONSIBLE_UNIT_ID:
                        metadata.responsibleUnitId != null
                            ? String(metadata.responsibleUnitId)
                            : "",
                    DESC_KEYWORDS_JSON: JSON.stringify(metadata.keywords || []),
                    DESC_PRELIM_CLASS: metadata.preliminaryClass || "",
                    DESC_CLASSIFICATION_CODE: metadata.classificationCode || "",
                });

                await safeAudit({
                    accion: "CARGA_MASIVA_DOCUMENTO",
                    resultado: "PERMITIDO",
                    usuario_id,
                    documento_id: nuevoDoc.id,
                    evento: "ARCHIVADO",
                    detalle: {
                        accion_solicitada: "IMPORTAR_PDF_ARCHIVADO",
                        archivo_original: originalname,
                        origen_documento: origen,
                        hash_sha256: hash,
                        verificacion_firma_estado,
                        aplica_validacion_firma,
                        mensaje: "Documento importado correctamente",
                    },
                });

                batchHashes.add(hash);

                resultado.importados.push({
                    documento_id: nuevoDoc.id,
                    titulo: metadata.title || tituloBase,
                    archivo: originalname,
                    hash_sha256: hash,
                    verificacion_firma_estado: "NO_APLICA",
                    estado: "ARCHIVADO",
                    metadata,
                });
            } catch (err) {
                this._safeDeleteFile(filePath);

                resultado.rechazados.push({
                    archivo: originalname,
                    motivo: err?.message || "Error procesando archivo",
                });
            }
        }

        resultado.total_importados = resultado.importados.length;
        resultado.total_rechazados = resultado.rechazados.length;

        return resultado;
    },

    // =========================
    // Edición
    // =========================
    async editDocument(userId, documentId, content) {
        const permissions = await permRepo.getForUser(userId);

        if (!permissions.includes("EDIT")) {
            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id: userId,
                documento_id: Number(documentId),
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "EDITAR_DOCUMENTO",
                    motivo: "FALTA_DE_PERMISO",
                    descripcion: "No tiene permiso para editar este documento.",
                },
            });

            const e = new Error("No tiene permiso para editar este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({
            documento_id: Number(documentId),
            usuario_id: Number(userId),
        });

        const doc = await documentoRepo.findById(documentId);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const updatedDocument = await documentoRepo.updateContent(documentId, content);

        if (Number(doc.usuario_id) !== Number(userId)) {
            const editor = await userRepo.findById(userId);
            const editorNombre = editor
                ? `${editor.nombre} ${editor.apellido1 || ""}`.trim()
                : `Usuario ${userId}`;

            const link = process.env.APP_BASE_URL
                ? `${process.env.APP_BASE_URL}/documentos/${documentId}`
                : `/documentos/${documentId}`;

            await notificacionService.notifyAuthorDocumentEdited(
                {
                    documentoId: documentId,
                    documentoTitulo: doc.titulo,
                    autorId: doc.usuario_id,
                    editorNombre,
                    link,
                },
                { id: userId }
            );
        }

        await safeAudit({
            accion: "EDICION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id: userId,
            documento_id: Number(documentId),
            evento: "EDICION",
            detalle: {
                accion_solicitada: "EDITAR_DOCUMENTO",
                mensaje: "Edición aplicada",
            },
        });

        return updatedDocument;
    },

    // =========================
    // Firma vieja (si la seguís usando)
    // =========================
    async signDocument(userId, documentId) {
        const permissions = await permRepo.getForUser(userId);

        if (!permissions.includes("SIGN")) {
            await safeAudit({
                accion: "FIRMA_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id: userId,
                documento_id: Number(documentId),
                evento: "FIRMA",
                detalle: {
                    accion_solicitada: "FIRMAR_DOCUMENTO",
                    motivo: "FALTA_DE_PERMISO",
                    descripcion: "No tiene permiso para firmar este documento.",
                },
            });

            const e = new Error("No tiene permiso para firmar este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({
            documento_id: Number(documentId),
            usuario_id: Number(userId),
        });

        const signedDocument = await documentoRepo.sign(documentId, userId);

        await safeAudit({
            accion: "FIRMA_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id: userId,
            documento_id: Number(documentId),
            evento: "FIRMA",
            detalle: {
                accion_solicitada: "FIRMAR_DOCUMENTO",
                mensaje: "Documento firmado",
            },
        });

        return signedDocument;
    },

    // =========================
    // Listados / acceso
    // =========================
    async getDocumentsFromProduction() {
        const [rows] = await pool.query("SELECT * FROM VW_Vista_Documentos");
        return rows;
    },

    async getAllDocuments() {
        const query = `
            SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha, c.nombre AS categoria
            FROM Documento d
                     LEFT JOIN Categoria c ON d.categoria_id = c.id
            ORDER BY d.fecha DESC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    async getAccessibleDocuments(userId) {
        const sql = `
            SELECT *
            FROM VW_Documentos_Accesibles
            WHERE viewer_usuario_id = ?
            ORDER BY fecha_creacion DESC
        `;
        const [rows] = await pool.query(sql, [userId]);
        return rows;
    },
    /*async getArchivedDocumentsForExternal() {
        return await documentoRepo.findArchivedForExternal();
    },*/
    async getArchivedDocumentsForExternal(usuario_id) {
        return await documentoRepo.findArchivedForExternal(usuario_id);
    },
    async _hasExternalApprovedAccess({ documento_id, usuario_id }) {
        const [rows] = await pool.query(
            `
        SELECT 1
        FROM Permiso_Usuario
        WHERE usuario_id = ?
          AND documento_id = ?
          AND permiso = 'VIEW'
        LIMIT 1
        `,
            [Number(usuario_id), Number(documento_id)]
        );

        return rows.length > 0;
    },

    _isExternalUser(user) {
        const role =
            user?.rol ||
            user?.role ||
            user?.nombre_rol ||
            user?.rol_nombre ||
            "";

        return String(role).toUpperCase() === "USUARIO_EXTERNO";
    },

    /** Expuesto para rutas que necesitan omitir VW_Documentos_Accesibles tras validar Permiso_Usuario (HU-024). */
    isExternalUser(user) {
        return this._isExternalUser(user);
    },

    async assertExternalDocumentAccessIfNeeded({ documento_id, user }) {
        if (!this._isExternalUser(user)) return;

        const ok = await this._hasExternalApprovedAccess({
            documento_id,
            usuario_id: user.id,
        });

        if (!ok) {
            const e = new Error(
                "Debe tener una solicitud aprobada para acceder a este documento."
            );
            e.code = "FORBIDDEN";
            throw e;
        }
    },

    /**
     * Descarga PDF (firma / HU-018): primero el modelo estándar (VW_Documentos_Accesibles);
     * si falla, permite acceso con Permiso_Usuario VIEW (mismo criterio que listado de externos).
     * Así un usuario externo con permiso explícito no queda bloqueado por la vista aunque el JWT
     * no marque solo "USUARIO_EXTERNO".
     */
    async assertFirmaPdfDownloadAccess({ documento_id, usuario_id, user: _user }) {
        try {
            await this._assertHasAccess({ documento_id, usuario_id });
            return;
        } catch (e) {
            if (e.code !== "FORBIDDEN") throw e;
        }
        const ok = await this._hasExternalApprovedAccess({
            documento_id,
            usuario_id,
        });
        if (!ok) {
            const err = new Error(
                "No tiene permiso para descargar este documento. Si acaba de obtener acceso, cierre sesión y vuelva a entrar."
            );
            err.code = "FORBIDDEN";
            throw err;
        }
    },
    async getDocumentosByExpediente(expedienteId) {
        if (!expedienteId || Number.isNaN(Number(expedienteId))) {
            const e = new Error("Expediente inválido");
            e.code = "BAD_REQUEST";
            throw e;
        }

        return await documentoRepo.getByExpedienteId(Number(expedienteId));
    },

    // =========================
    // HU-007 Crear desde plantilla
    // =========================
    async createFromPlantilla({
                                  plantilla_id,
                                  titulo,
                                  categoria_id,
                                  confid_level,
                                  usuario_id,
                                  unidad_id,
                              }) {
        if (!usuario_id) throw new Error("Usuario no autenticado");
        if (!unidad_id) throw new Error("Unidad no determinada");
        if (!plantilla_id) throw new Error("Debe indicar plantilla_id");

        const pl = await plantillaRepo.findById(plantilla_id);
        if (!pl) throw new Error("Plantilla no encontrada");

        let htmlContent = "";
        try {
            const filePath = rutaWebToFs(pl.ruta_archivo);

            const styleMap = [
                "p[style-name='Título'] => h2.word-title",
                "p[style-name='Encabezado'] => h3.word-header",
                "p[style-name='Normal'] => p.word-text",
                "r[style-name='Negrita'] => strong",
                "r[style-name='Cursiva'] => em",
                "table => table.word-table",
                "th => th.word-th",
                "td => td.word-td",
            ];

            const result = await mammoth.convertToHtml({
                path: filePath,
                styleMap,
                includeDefaultStyleMap: true,
            });

            htmlContent = result.value || "";
        } catch (err) {
            console.warn("⚠️ No se pudo convertir la plantilla:", err.message);
        }

        const numero_serie = tmpSerie();

        const nuevoDoc = await documentoRepo.insertDocumento({
            numero_serie,
            titulo: titulo || `Borrador - ${pl.nombre} (${pl.version})`,
            contenido: htmlContent,
            estado: "CREACION",
            confid_level: confid_level || "INTERNAL",
            fecha: new Date(),
            unidad_id,
            usuario_id,
            categoria_id: categoria_id ?? null,
        });

        await documentoRepo.linkPlantilla(nuevoDoc.id, plantilla_id);
        await documentoRepo.insertVersion({
            documento_id: nuevoDoc.id,
            contenido: htmlContent,
            fecha: new Date(),
            nombre_versionado: `Inicial (${pl.nombre} v${pl.version})`,
        });

        // Importante: usar safeAudit para que la bitácora guarde snapshot del documento
        // (evita que el estado/códigos cambien en eventos ya registrados).
        await safeAudit({
            fecha: new Date(),
            accion: "CREACION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id: nuevoDoc.id,
            evento: "CREACION",
            detalle: {
                accion_solicitada: "CREAR_DESDE_PLANTILLA",
                mensaje: "Documento creado (CREACION)",
                plantilla_id,
                numero_serie,
            },
        });

        await documentMetadataService.captureTechnical({
            documento_id: nuevoDoc.id,
            mimeType: "text/html",
            fileExt: "html",
            content: htmlContent,
            storageUri: "",
            actorId: usuario_id,
        });

        return { documento_id: nuevoDoc.id, numero_serie };
    },

    // =========================
    // HU-017 Solicitar firma
    // =========================
    async prepareForSignature({
                                  documento_id,
                                  usuario_id,
                                  firmantesIds = [],
                                  fecha_limite = null,
                              }) {
        const doc = await documentoRepo.findById(documento_id);

        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        if (!["CREACION", "EDICION", "FIRMA_PARCIAL"].includes(doc.estado)) {
            const e = new Error("Estado no válido para preparar firma");
            e.code = "STATE_ERROR";
            throw e;
        }

        if (!Array.isArray(firmantesIds) || firmantesIds.length === 0) {
            const e = new Error("Debe seleccionar al menos un firmante");
            e.code = "BAD_REQUEST";
            throw e;
        }

        await documentMetadataService.ensureDescriptiveComplete(documento_id);

        const oficial = officialIndex(documento_id);

        await pool.query(
            `UPDATE Documento
             SET numero_serie = ?,
                 estado = 'FIRMA_PARCIAL',
                 numero_firmas = ?,
                 firmas_obtenidas = IFNULL(firmas_obtenidas, 0)
             WHERE id = ?`,
            [oficial, firmantesIds.length, documento_id]
        );

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "CODIGO_OFICIAL",
            valor: oficial,
            });

            await documentMetadataService.markApproved({
            documento_id,
            actorId: usuario_id,
            });

            await documentMetadataService.captureTechnical({
            documento_id,
            actorId: usuario_id,
            });

        await safeAudit({
            accion: "PREPARAR_FIRMA",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "FIRMA",
            detalle: {
                accion_solicitada: "PREPARAR_PARA_FIRMA",
                mensaje: `Asignado índice oficial ${oficial}`,
                numero_serie: oficial,
                firmantes: firmantesIds,
                fecha_limite,
            },
        });

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "FIRMANTES_ASIGNADOS",
            valor: JSON.stringify(firmantesIds),
        });

        for (const uid of firmantesIds) {
            await pool.query(
                `INSERT INTO Permiso_Usuario (usuario_id, documento_id, permiso, motive)
                 VALUES (?, ?, 'SIGN', 'Asignado por solicitud de firma')
                     ON DUPLICATE KEY UPDATE motive = VALUES(motive)`,
                [Number(uid), documento_id]
            );
        }

        await notificacionService.notifyFirma({
            documentoId: documento_id,
            actorId: usuario_id,
            selectedUserIds: firmantesIds,
            fechaLimite: fecha_limite,
            link: `/editor/document/${documento_id}/edit`,
        });

        return {
            ok: true,
            documento_id,
            numero_serie_oficial: oficial,
            firmantes: firmantesIds,
            fecha_limite,
            estado: "FIRMA",
        };
    },

    // =========================
    // HU-008 versiones / colab / etc
    // =========================
    async getLatestVersion(documento_id) {
        return documentoRepo.getLatestVersion(documento_id);
    },

    async colabSave({ documento_id, usuario_id, contenido, base_version_id }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        const permissions = await permRepo.getForUser(usuario_id);
        if (!permissions.includes("EDIT")) {
            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id: Number(documento_id),
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "COLAB_GUARDAR",
                    motivo: "FALTA_DE_PERMISO",
                    descripcion: "No tiene permiso para editar este documento.",
                },
            });

            const e = new Error("No tiene permiso para editar este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["CREACION", "EDICION"].includes(doc.estado)) {
            const e = new Error("Documento no editable");
            e.code = "STATE_ERROR";
            throw e;
        }

        const currentContent = doc.contenido ?? "";
        const incomingContent = contenido ?? "";

        if (currentContent === incomingContent) {
            const latest = await documentoRepo.getLatestVersion(documento_id);
            return {
                version_id: latest?.id ?? 0,
                next_version: latest?.id ?? 0,
                conflict: false,
                saved: false,
                reason: "NO_CHANGES",
            };
        }

        const latest = await documentoRepo.getLatestVersion(documento_id);
        if (latest && latest.id !== base_version_id) {
            const e = new Error("Versión desactualizada");
            e.code = "VERSION_CONFLICT";
            e.details = { latest_version_id: latest.id };
            throw e;
        }

        const nextNumber = (await documentoRepo.countVersions(documento_id)) + 1;
        const nombre_versionado = `${doc.titulo}_V${nextNumber}`;

        const previousVersionId = await documentoRepo.insertVersion({
            documento_id,
            contenido: incomingContent,
            fecha: new Date(),
            nombre_versionado,
        });

        await documentoRepo.updateContenido(documento_id, incomingContent);
        await documentoRepo.updateEstado(documento_id, "EDICION");

        await documentMetadataService.captureTechnical({
            documento_id,
            mimeType: "text/html",
            fileExt: "html",
            content: incomingContent,
            storageUri: "",
            actorId: usuario_id,
        });

        if (Number(doc.usuario_id) !== Number(usuario_id)) {
            const editor = await userRepo.findById(usuario_id);
            const editorNombre = editor
                ? `${editor.nombre} ${editor.apellido1 || ""}`.trim()
                : `Usuario ${usuario_id}`;

            const link = process.env.APP_BASE_URL
                ? `${process.env.APP_BASE_URL}/documentos/${documento_id}`
                : `/documentos/${documento_id}`;

            await notificacionService.notifyAuthorDocumentEdited(
                {
                    documentoId: documento_id,
                    documentoTitulo: doc.titulo,
                    autorId: doc.usuario_id,
                    editorNombre,
                    editorEmail: editor?.email,
                    link,
                },
                { id: usuario_id }
            );
        }

        await safeAudit({
            accion: "EDICION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "COLAB_GUARDAR",
                mensaje: "Edición colaborativa aplicada",
                version_id: previousVersionId,
                nombre_versionado,
            },
        });

        return {
            version_id: previousVersionId,
            next_version: previousVersionId,
            conflict: false,
            saved: true,
            nombre_versionado,
        };
    },

    async restoreVersion({ documento_id, version_id, usuario_id, motivo }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const version = await documentoRepo.findVersionById(version_id);
        if (!version || Number(version.documento_id) !== Number(documento_id)) {
            const e = new Error("Versión no encontrada o no pertenece al documento");
            e.code = "NOT_FOUND";
            throw e;
        }

        const nextNumber = (await documentoRepo.countVersions(documento_id)) + 1;
        const nombre_versionado = `${doc.titulo}_V${nextNumber}_REST`;

        const version_creada_id = await documentoRepo.insertVersion({
            documento_id,
            contenido: version.contenido,
            fecha: new Date(),
            nombre_versionado,
        });

        await documentoRepo.updateContenido(documento_id, version.contenido);
        await documentoRepo.updateEstado(documento_id, "EDICION");

        await safeAudit({
            accion: "DOC_VERSION_RESTORE",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "RESTAURAR_VERSION",
                mensaje: `Restaurada desde versión ${version_id}`,
                version_origen_id: version_id,
                version_creada_id,
                motivo: motivo ?? "",
                nombre_versionado,
            },
        });

        return {
            documento_id,
            version_origen_id: version_id,
            version_restaurada_id: version_creada_id,
            nombre_versionado,
            html: version.contenido,
        };
    },

    async listVersions(documento_id) {
        const [rows] = await pool.query(
            `SELECT v.id, v.fecha, v.nombre_versionado
             FROM Version_Documento v
             WHERE v.documento_id = ?
             ORDER BY v.fecha DESC, v.id DESC`,
            [documento_id]
        );
        return rows;
    },

    // =========================
    // HU-016 comentarios
    // =========================
    async listComentarios(documento_id) {
        return comentarioRepo.listByDocumento(documento_id);
    },

    async addComentario({ documento_id, usuario_id, descripcion }) {
        const comentario_id = await comentarioRepo.insert({
            documento_id,
            usuario_id,
            descripcion,
        });

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: "COMENTARIO_AGREGADO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
        });

        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: "OTRA",
            recurso: "COMENTARIO",
            parametros: JSON.stringify({ comentario_id, mensaje: "Comentario registrado" }),
        });

        return { comentario_id };
    },

    async resolveComentario({ comentario_id, usuario_id }) {
        const com = await comentarioRepo.findById(comentario_id);
        if (!com) throw new Error("Comentario no existe");
        await comentarioRepo.resolve(comentario_id);

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: "COMENTARIO_RESUELTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id: com.documento_id,
        });

        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: "OTRA",
            recurso: "COMENTARIO",
            parametros: JSON.stringify({ comentario_id, mensaje: "Marcado como resuelto" }),
        });

        return { ok: true };
    },

    // =========================
    // Lectura contenido
    // =========================
    async getContenido({ documento_id, usuario_id, skipAccessCheck = false }) {
        if (!skipAccessCheck) {
            const [rows] = await pool.query(
                `SELECT 1 FROM VW_Documentos_Accesibles
                 WHERE viewer_usuario_id = ? AND documento_id = ? LIMIT 1`,
                [usuario_id, documento_id]
            );

            if (!rows.length) {
                const e = new Error("Acceso no autorizado al documento");
                e.code = "FORBIDDEN";
                throw e;
            }
        }

        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const latest = await documentoRepo.getLatestVersion(documento_id);
        const signedPdfCurrent = await this._getMetadatoValor(documento_id, "SIGNED_PDF_CURRENT");

        return {
            documento_id,
            titulo: doc.titulo,
            estado: doc.estado,
            contenido: doc.contenido ?? "",
            latest_version_id: latest?.id ?? 0,
            has_signed_pdf: Boolean(signedPdfCurrent),
            signed_pdf_url: signedPdfCurrent ? `/documentos/${documento_id}/firma/pdf-actual` : null,
            prefer_signed_pdf_view:
                Boolean(signedPdfCurrent) &&
                ["FIRMA_PARCIAL", "ARCHIVADO"].includes(doc.estado),
        };
    },


    async getPdfBufferForConsultaPreview({ documento_id }) {
        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["APROBADO", "ARCHIVADO", "FIRMA_PARCIAL", "FIRMA"].includes(doc.estado)) {
            const e = new Error(
                `El documento no está disponible para vista previa o descarga (estado: ${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        const currentSignedPath = await this._getMetadatoValor(documento_id, "SIGNED_PDF_CURRENT");

        if (currentSignedPath && fs.existsSync(currentSignedPath)) {
            const buffer = fs.readFileSync(currentSignedPath);
            return {
                filename: `${safeTitle}_${documento_id}_firmado.pdf`,
                buffer,
            };
        }

        const html = String(doc.contenido || "").trim();
        if (!html) {
            const e = new Error("El documento no tiene contenido para exportar a PDF.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const cleanedHtml = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<link[^>]*rel=["']?preconnect["']?[^>]*>/gi, "")
            .replace(/<link[^>]*rel=["']?dns-prefetch["']?[^>]*>/gi, "");

        const buffer = await pdfService.htmlToPdfBuffer(cleanedHtml, {
            title: doc.titulo || "Documento",
        });

        return {
            filename: `${safeTitle}_${documento_id}.pdf`,
            buffer,
        };
    },

    // ==========================================================
    // ✅ Firma (MVP): info + descargar + confirmar (subir PDF)
    // ==========================================================
    async _canUserSign({ documento_id, usuario_id }) {
        const [rows] = await pool.query(
            `SELECT 1
             FROM Permiso_Usuario
             WHERE usuario_id = ? AND documento_id = ? AND permiso = 'SIGN'
                 LIMIT 1`,
            [Number(usuario_id), Number(documento_id)]
        );
        return rows.length > 0;
    },

    async _getMetadatoValor(documento_id, tipo) {
        const [rows] = await pool.query(
            `SELECT valor FROM Metadato WHERE documento_id = ? AND tipo = ? LIMIT 1`,
            [Number(documento_id), String(tipo)]
        );
        return rows[0]?.valor ?? null;
    },

    async _getSignedList(documento_id) {
        const raw = await this._getMetadatoValor(documento_id, "FIRMAS_REALIZADAS");
        if (!raw) return [];
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : [];
        } catch {
            return [];
        }
    },

    async _setSignedList(documento_id, signedUserIds) {
        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "FIRMAS_REALIZADAS",
            valor: JSON.stringify(Array.from(new Set((signedUserIds || []).map(Number)))),
        });
    },

    async getSignatureInfo({ documento_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const estado = doc.estado;
        const estadoOk = ["FIRMA", "FIRMA_PARCIAL"].includes(estado);

        const puedePorPermiso = await this._canUserSign({ documento_id, usuario_id });
        const signedList = await this._getSignedList(documento_id);
        const ya_firmo = signedList.includes(Number(usuario_id));

        const firmas_requeridas = Number(doc.numero_firmas || 0);
        const firmas_obtenidas = Number(doc.firmas_obtenidas || 0);

        let puede_firmar = true;
        let motivo = null;

        if (!estadoOk) {
            puede_firmar = false;
            motivo = `El documento no está en estado de firma (estado actual: ${estado}).`;
        } else if (!puedePorPermiso) {
            puede_firmar = false;
            motivo = "No estás asignado como firmante para este documento.";
        } else if (ya_firmo) {
            puede_firmar = false;
            motivo = "Ya firmaste este documento.";
        } else if (firmas_requeridas > 0 && firmas_obtenidas >= firmas_requeridas) {
            puede_firmar = false;
            motivo = "El documento ya alcanzó el total de firmas requeridas.";
        }

        return {
            documento_id,
            titulo: doc.titulo,
            estado,
            firmas_requeridas,
            firmas_obtenidas,
            ya_firmo,
            puede_firmar,
            motivo,
        };
    },

    async confirmSignature({ documento_id, usuario_id, signedPdfPath }) {
        if (!signedPdfPath) {
            const e = new Error("Debe adjuntar un PDF firmado");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const lowerPath = String(signedPdfPath).trim().toLowerCase();
        if (!lowerPath.endsWith(".pdf")) {
            const e = new Error("El archivo adjunto debe ser un PDF.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        if (!["FIRMA", "FIRMA_PARCIAL"].includes(doc.estado)) {
            const e = new Error(
                `El documento no está en estado de firma (estado actual: ${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const puedeFirmar = await this._canUserSign({ documento_id, usuario_id });
        if (!puedeFirmar) {
            const e = new Error("No estás asignado como firmante para este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        const signedList = await this._getSignedList(documento_id);

        if (signedList.includes(Number(usuario_id))) {
            const e = new Error("Ya firmaste este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: `SIGNED_PDF_${Number(usuario_id)}`,
            valor: String(signedPdfPath),
        });

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "SIGNED_PDF_CURRENT",
            valor: String(signedPdfPath),
        });

        signedList.push(Number(usuario_id));
        const uniqueSigned = Array.from(new Set(signedList.map(Number)));

        await this._setSignedList(documento_id, uniqueSigned);

        const nuevasObtenidas = uniqueSigned.length;
        const firmasRequeridas = Number(doc.numero_firmas || 0);

        const nuevoEstado =
            firmasRequeridas > 0 && nuevasObtenidas >= firmasRequeridas
                ? "ARCHIVADO"
                : nuevasObtenidas > 0
                    ? "FIRMA_PARCIAL"
                    : "FIRMA";

        await pool.query(
            `UPDATE Documento
             SET firmas_obtenidas = ?,
                 estado = ?
             WHERE id = ?`,
            [nuevasObtenidas, nuevoEstado, Number(documento_id)]
        );

        await safeAudit({
            accion: "CONFIRMAR_FIRMA",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "FIRMA",
            detalle: {
                accion_solicitada: "CONFIRMAR_FIRMA",
                signedPdfPath,
                firmas_obtenidas: nuevasObtenidas,
                firmas_requeridas: firmasRequeridas,
                estado_resultante: nuevoEstado,
            },
        });

        return {
            ok: true,
            documento_id,
            estado: nuevoEstado,
            firmas_obtenidas: nuevasObtenidas,
            firmas_requeridas: firmasRequeridas,
        };
    },

    async getCurrentSignedPdf({ documento_id, usuario_id }) {
        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const currentPath = await this._getMetadatoValor(documento_id, "SIGNED_PDF_CURRENT");
        if (!currentPath) {
            const e = new Error("El documento no tiene un PDF firmado actual.");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!fs.existsSync(currentPath)) {
            const e = new Error("No se encontró el archivo PDF firmado.");
            e.code = "NOT_FOUND";
            throw e;
        }

        const buffer = fs.readFileSync(currentPath);

        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        return {
            filename: `${safeTitle}_${documento_id}_firmado.pdf`,
            buffer,
        };
    },

    async downloadPdfForSignature({ documento_id, usuario_id, skipAccessCheck = false }) {
        if (!skipAccessCheck) {
            await this._assertHasAccess({ documento_id, usuario_id });
        }

        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        // Permitir descargar para firma mientras esté en proceso,
        // y también devolver el firmado actual si ya quedó archivado.
        if (!["FIRMA", "FIRMA_PARCIAL", "ARCHIVADO"].includes(doc.estado)) {
            const e = new Error(
                `El documento no está disponible para descarga de firma (estado actual: ${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        // ✅ PRIORIDAD 1: si ya existe un PDF firmado actual, devolver ese
        const currentSignedPath = await this._getMetadatoValor(documento_id, "SIGNED_PDF_CURRENT");

        if (currentSignedPath && fs.existsSync(currentSignedPath)) {
            const buffer = fs.readFileSync(currentSignedPath);

            return {
                filename: `${safeTitle}_${documento_id}_firmado_actual.pdf`,
                buffer,
            };
        }

        // ✅ PRIORIDAD 2: si todavía no hay firmado actual, generar desde HTML
        const html = String(doc.contenido || "").trim();
        if (!html) {
            const e = new Error("El documento no tiene contenido para exportar a PDF.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const cleanedHtml = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<link[^>]*rel=["']?preconnect["']?[^>]*>/gi, "")
            .replace(/<link[^>]*rel=["']?dns-prefetch["']?[^>]*>/gi, "");

        const buffer = await pdfService.htmlToPdfBuffer(cleanedHtml, {
            title: doc.titulo || "Documento",
        });

        return {
            filename: `${safeTitle}_${documento_id}.pdf`,
            buffer,
        };
    },

    async downloadDocxForSignature({ documento_id, usuario_id }) {
        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["FIRMA", "FIRMA_PARCIAL"].includes(doc.estado)) {
            const e = new Error(`El documento no está en estado de firma (estado actual: ${doc.estado}).`);
            e.code = "STATE_ERROR";
            throw e;
        }

        const html = String(doc.contenido || "");
        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        const buffer = await wordService.htmlToDocxBuffer(html, {
            title: doc.titulo || "Documento",
            creator: "Patrimonius",
        });

        return {
            filename: `${safeTitle}_${documento_id}.docx`,
            buffer,
        };
    },

    // =========================
    // 📎 ANEXOS
    // =========================
    async addAnexo({ documento_id, usuario_id, file, descripcion = null }) {
        if (!file) {
            const e = new Error("Debe adjuntar un archivo.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        if (!["FIRMA", "FIRMA_PARCIAL"].includes(doc.estado)) {
            // Registrar intento en bitácora (aunque falle por estado).
            await safeAudit({
                accion: "ANEXO_AGREGADO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "AGREGAR_ANEXO",
                    motivo: "ESTADO_NO_PERMITIDO",
                    estado_actual: doc.estado,
                },
            });

            const e = new Error(
                `No se pueden agregar anexos en el estado actual (${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const actuales = await documentoAnexoRepo.listByDocumento(documento_id);
        const orden_visual = (actuales?.length || 0) + 1;

        const created = await documentoAnexoRepo.create({
            documento_id,
            usuario_id,
            nombre_original: file.originalname,
            nombre_guardado: file.filename,
            ruta_archivo: file.path,
            mime_type: file.mimetype || "application/octet-stream",
            tamano_bytes: Number(file.size || 0),
            descripcion: descripcion ?? null,
            orden_visual,
        });

        await safeAudit({
            accion: "ANEXO_AGREGADO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "AGREGAR_ANEXO",
                anexo_id: created.id,
                nombre_original: created.nombre_original,
                mime_type: created.mime_type,
                tamano_bytes: created.tamano_bytes,
            },
        });

        return created;
    },

    async listAnexos({ documento_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        return await documentoAnexoRepo.listByDocumento(documento_id);
    },

    async getAnexoFile({ documento_id, anexo_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const anexo = await documentoAnexoRepo.findById(anexo_id);
        if (!anexo || Number(anexo.documento_id) !== Number(documento_id)) {
            const e = new Error("Anexo no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!fs.existsSync(anexo.ruta_archivo)) {
            const e = new Error("No se encontró el archivo del anexo.");
            e.code = "NOT_FOUND";
            throw e;
        }

        const buffer = fs.readFileSync(anexo.ruta_archivo);

        return {
            filename: anexo.nombre_original,
            mime_type: anexo.mime_type || "application/octet-stream",
            buffer,
        };
    },

    async deleteAnexo({ documento_id, anexo_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        if (doc.estado === "ARCHIVADO") {
            const e = new Error("No se pueden eliminar anexos de un documento archivado.");
            e.code = "STATE_ERROR";
            throw e;
        }

        const anexo = await documentoAnexoRepo.findById(anexo_id);
        if (!anexo || Number(anexo.documento_id) !== Number(documento_id)) {
            const e = new Error("Anexo no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        await documentoAnexoRepo.deleteById(anexo_id);

        if (anexo.ruta_archivo && fs.existsSync(anexo.ruta_archivo)) {
            try {
                fs.unlinkSync(anexo.ruta_archivo);
            } catch (err) {
                console.warn("⚠️ No se pudo borrar el archivo físico del anexo:", err.message);
            }
        }

        await safeAudit({
            accion: "ANEXO_ELIMINADO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "ELIMINAR_ANEXO",
                anexo_id,
                nombre_original: anexo.nombre_original,
            },
        });

        return { ok: true };
    },

    async archiveDocument({ documento_id, usuario_id }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        // Validación de firma digital retirada de HU-20:
        // no se bloquea archivado por verificacion_firma_estado.
        const [rows] = await pool.query(
            `
                SELECT verificacion_firma_estado
                FROM Documento
                WHERE id = ?
            `,
            [Number(documento_id)]
        );

        const estadoVerif = rows?.[0]?.verificacion_firma_estado ?? "NO_APLICA";

        await pool.query(
            `
                UPDATE Documento
                SET estado = 'ARCHIVADO'
                WHERE id = ?
            `,
            [Number(documento_id)]
        );

        await safeAudit({
            accion: "ARCHIVAR_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "ARCHIVADO",
            detalle: {
                accion_solicitada: "ARCHIVAR_DOCUMENTO",
                verificacion_firma_estado: estadoVerif,
                mensaje: "Documento archivado",
            },
        });

        try {
            await notificacionService.notifyArchivado({
                documentoId: documento_id,
                actorId: usuario_id,
            });
        } catch (e) {
            console.warn("⚠️ No se pudo notificar archivado:", e?.message);
        }

        return {
            ok: true,
            documento_id,
            estado: "ARCHIVADO",
            verificacion_firma_estado: estadoVerif,
        };
    },
    // Método para obtener los documentos pendientes de clasificación
    async getDocumentsPendingClassification() {
        const query = `
            SELECT d.id, d.titulo, d.numero_serie, d.estado, e.nombre AS expediente
            FROM Documento d
                     LEFT JOIN Expediente e ON d.expediente_id = e.id
            WHERE d.expediente_id IS NOT NULL  -- Obtener todos los documentos con expediente_id asignado
            ORDER BY d.fecha DESC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    // Método para actualizar el expediente de un documento
    async updateDocumentoExpediente(documentoId, expedienteId) {
        const query = `
      UPDATE Documento
      SET expediente_id = ?
      WHERE id = ?
    `;
        const result = await pool.query(query, [expedienteId, documentoId]);
        if (result.affectedRows === 0) {
            throw new Error('Documento no encontrado');
        }
        return { documentoId, expedienteId };
    },
};
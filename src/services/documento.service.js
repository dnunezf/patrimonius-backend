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

import mammoth from "mammoth";
import { rutaWebToFs } from "../utils/path.js";
import { notificacionService } from "./notificacion.service.js";
import { pdfService } from "./pdf.service.js";
import { wordService } from "./word.service.js";

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
            detalle: JSON.stringify(detalle ?? {}),
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

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: "CREACION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id: nuevoDoc.id,
        });

        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: "CREACION",
            detalle: JSON.stringify({
                accion_solicitada: "CREAR_DESDE_PLANTILLA",
                mensaje: "Documento creado (CREACION)",
                plantilla_id,
                numero_serie,
            }),
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
    async getContenido({ documento_id, usuario_id }) {
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

    async downloadPdfForSignature({ documento_id, usuario_id }) {
        await this._assertHasAccess({ documento_id, usuario_id });

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

        const [rows] = await pool.query(
            `
        SELECT verificacion_firma_estado
        FROM Documento
        WHERE id = ?
        `,
            [Number(documento_id)]
        );

        const estadoVerif = rows?.[0]?.verificacion_firma_estado ?? "PENDIENTE";

        if (["INVALIDA", "CADUCADA", "REVOCADA"].includes(estadoVerif)) {
            const e = new Error(
                `No se puede archivar: la verificación de firma digital está ${estadoVerif}.`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

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
    }
};
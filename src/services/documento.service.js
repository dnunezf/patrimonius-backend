// src/services/documento.service.js
import { permRepo } from "../repositories/permRepo.js";
import { pool } from "../db/pool.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { plantillaRepo } from "../repositories/plantillaRepo.js";
import { comentarioRepo } from "../repositories/comentariosRepo.js"; // shim
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { documentMetadataService } from "./documentMetadata.service.js";
import { userRepo } from "../repositories/userRepo.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js"; // ✅ AGREGADO

// ✅ AGREGADO: para convertir DOCX a HTML
import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { rutaWebToFs } from "../utils/path.js";
import { notificacionService } from "./notificacion.service.js";

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

        const doc = await documentoRepo.findById(documentId);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const updatedDocument = await documentoRepo.updateContent(documentId, content);

        // ✅ Notificar al autor si otro usuario modificó
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

    async getDocumentsFromProduction() {
        try {
            const [rows] = await pool.query("SELECT * FROM VW_Vista_Documentos");
            return rows;
        } catch (error) {
            throw new Error("Error fetching documents: " + error.message);
        }
    },

    async getAllDocuments() {
        try {
            const query = `
        SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha, c.nombre AS categoria
        FROM Documento d
        LEFT JOIN Categoria c ON d.categoria_id = c.id
        ORDER BY d.fecha DESC`;
            const [rows] = await pool.query(query);
            return rows;
        } catch (error) {
            console.error("Error fetching documents:", error);
            throw new Error("Error fetching documents: " + error.message);
        }
    },

    async getAccessibleDocuments(userId) {
        try {
            const sql = `
        SELECT *
        FROM VW_Documentos_Accesibles
        WHERE viewer_usuario_id = ?
        ORDER BY fecha_creacion DESC
      `;
            const [rows] = await pool.query(sql, [userId]);
            return rows;
        } catch (error) {
            throw new Error("Error fetching accessible documents: " + error.message);
        }
    },

    /** HU-007: Crear documento desde plantilla */
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
            console.log("🧭 Buscando plantilla en:", filePath);

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
            console.log(`✅ Plantilla "${pl.nombre}" convertida correctamente con formato.`);
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

    /** HU-007/HU-017: preparar documento para firma (SOLICITAR FIRMA) */
    async prepareForSignature({
                                  documento_id,
                                  usuario_id,
                                  firmantesIds = [],
                                  fecha_limite = null,
                              }) {
        const doc = await documentoRepo.findById(documento_id);

        if (!doc) {
            await safeAudit({
                accion: "PREPARAR_FIRMA",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "FIRMA",
                detalle: {
                    accion_solicitada: "PREPARAR_PARA_FIRMA",
                    motivo: "DOCUMENTO_NO_EXISTE",
                    descripcion: "Documento no existe",
                },
            });

            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["CREACION", "EDICION", "FIRMA_PARCIAL"].includes(doc.estado)) {
            await safeAudit({
                accion: "PREPARAR_FIRMA",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "FIRMA",
                detalle: {
                    accion_solicitada: "PREPARAR_PARA_FIRMA",
                    motivo: "ESTADO_INVALIDO",
                    descripcion: `Estado no válido para preparar firma: ${doc.estado}`,
                },
            });

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

        // ✅ índice oficial + estado FIRMA + número_firmas
        await pool.query(
            `UPDATE Documento
       SET numero_serie = ?,
           estado = 'FIRMA',
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

        // 1) Guardar firmantes asignados (para uso posterior)
        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "FIRMANTES_ASIGNADOS",
            valor: JSON.stringify(firmantesIds),
        });

        // 2) Crear permisos SIGN para cada firmante (sin fallar si ya existía)
        for (const uid of firmantesIds) {
            await pool.query(
                `INSERT INTO Permiso_Usuario (usuario_id, documento_id, permiso, motive)
         VALUES (?, ?, 'SIGN', 'Asignado por solicitud de firma')
         ON DUPLICATE KEY UPDATE motive = VALUES(motive)`,
                [Number(uid), documento_id]
            );
        }

        // 3) Notificación FIRMA (IN_APP + EMAIL)
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

    /** HU-008: última versión */
    async getLatestVersion(documento_id) {
        return documentoRepo.getLatestVersion(documento_id);
    },

    /** HU-008: guardado colaborativo */
    async colabSave({ documento_id, usuario_id, contenido, base_version_id }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        const doc = await documentoRepo.findById(documento_id);

        if (!doc) {
            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "EDITAR_DOCUMENTO",
                    motivo: "DOCUMENTO_NO_EXISTE",
                    descripcion: "Documento no existe",
                },
            });

            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["CREACION", "EDICION"].includes(doc.estado)) {
            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "EDITAR_DOCUMENTO",
                    motivo: "ESTADO_INVALIDO",
                    descripcion: `Documento no editable en estado: ${doc.estado}`,
                },
            });

            const e = new Error("Documento no editable");
            e.code = "STATE_ERROR";
            throw e;
        }

        const currentContent = doc.contenido ?? "";
        const incomingContent = contenido ?? "";

        if (currentContent === incomingContent) {
            const latest = await documentoRepo.getLatestVersion(documento_id);

            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "PERMITIDO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "EDITAR_DOCUMENTO",
                    motivo: "NO_CHANGES",
                    descripcion: "Guardado sin cambios",
                    base_version_id,
                    latest_version_id: latest?.id ?? 0,
                },
            });

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
            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "EDITAR_DOCUMENTO",
                    motivo: "VERSION_CONFLICT",
                    descripcion: "Versión desactualizada",
                    base_version_id,
                    latest_version_id: latest.id,
                },
            });

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

        await safeAudit({
            accion: "EDICION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "EDITAR_DOCUMENTO",
                mensaje: `Nueva versión ${nombre_versionado}`,
                version_id: previousVersionId,
                nombre_versionado,
                base_version_id,
            },
        });

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

        return {
            version_id: previousVersionId,
            next_version: previousVersionId,
            conflict: false,
            saved: true,
            nombre_versionado,
        };
    },

    /** HU-010: restaurar versión */
    async restoreVersion({ documento_id, version_id, usuario_id, motivo }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            await safeAudit({
                accion: "DOC_VERSION_RESTORE",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "RESTAURAR_VERSION",
                    motivo: "DOCUMENTO_NO_EXISTE",
                    mensaje: "Documento no existe",
                },
            });

            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const version = await documentoRepo.findVersionById(version_id);
        if (!version || Number(version.documento_id) !== Number(documento_id)) {
            await safeAudit({
                accion: "DOC_VERSION_RESTORE",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "RESTAURAR_VERSION",
                    motivo: "VERSION_NO_ENCONTRADA",
                    mensaje: "Versión no encontrada o no pertenece al documento",
                    version_id,
                },
            });

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

    /** HU-016: comentarios */
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

    async getContenido({ documento_id, usuario_id }) {
        const [rows] = await pool.query(
            `SELECT 1 FROM VW_Documentos_Accesibles
       WHERE viewer_usuario_id = ? AND documento_id = ? LIMIT 1`,
            [usuario_id, documento_id]
        );

        if (!rows.length) {
            await safeAudit({
                accion: "LECTURA_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "LECTURA",
                detalle: {
                    accion_solicitada: "VER_CONTENIDO",
                    motivo: "SIN_ACCESO",
                    mensaje: "Acceso no autorizado al documento",
                },
            });

            const e = new Error("Acceso no autorizado al documento");
            e.code = "FORBIDDEN";
            throw e;
        }

        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            await safeAudit({
                accion: "LECTURA_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "LECTURA",
                detalle: {
                    accion_solicitada: "VER_CONTENIDO",
                    motivo: "DOCUMENTO_NO_EXISTE",
                    descripcion: "Documento no existe",
                },
            });

            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const latest = await documentoRepo.getLatestVersion(documento_id);

        await safeAudit({
            accion: "LECTURA_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "LECTURA",
            detalle: {
                accion_solicitada: "VER_CONTENIDO",
                mensaje: "Contenido consultado",
                latest_version_id: latest?.id ?? 0,
            },
        });

        return {
            documento_id,
            titulo: doc.titulo,
            estado: doc.estado,
            contenido: doc.contenido ?? "",
            latest_version_id: latest?.id ?? 0,
        };
    },

    // =========================
    // HU-018/HU-017 Firma (MVP)
    // =========================

    /** Valida si un usuario tiene permiso SIGN sobre el documento */
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

    /** Lee lista de firmantes ya firmaron (metadato JSON) */
    async _getSignedList(documento_id) {
        // Usamos metadato tipo: FIRMAS_REALIZADAS (JSON array de userIds)
        const meta = await metadatoRepo.findByTipo?.(documento_id, "FIRMAS_REALIZADAS");
        if (!meta?.valor) return [];
        try {
            const arr = JSON.parse(meta.valor);
            return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : [];
        } catch {
            return [];
        }
    },

    /** Guarda lista de firmantes ya firmaron */
    async _setSignedList(documento_id, signedUserIds) {
        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "FIRMAS_REALIZADAS",
            valor: JSON.stringify(Array.from(new Set((signedUserIds || []).map(Number)))),
        });
    },

    /** HU-018/HU-017: info para firmar (validaciones y estado) */
    async getSignatureInfo({ documento_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        // Validar acceso (reusa tu vista de accesibles)
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

        // Estado permitido para firmar
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

    /** HU-018/HU-017: confirmar firma (subir PDF firmado) */
    async confirmSignature({ documento_id, usuario_id, signedPdfPath }) {
        if (!signedPdfPath) {
            const e = new Error("Debe adjuntar un PDF firmado");
            e.code = "BAD_REQUEST";
            throw e;
        }

        // Reusar validaciones del info
        const info = await this.getSignatureInfo({ documento_id, usuario_id });
        if (!info.puede_firmar) {
            const e = new Error(info.motivo || "No puedes firmar este documento");
            e.code = "FORBIDDEN";
            throw e;
        }

        // Guardar evidencia de PDF firmado (por usuario)
        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: `SIGNED_PDF_${Number(usuario_id)}`,
            valor: String(signedPdfPath),
        });

        // Actualizar lista firmados + contador
        const signedList = await this._getSignedList(documento_id);
        signedList.push(Number(usuario_id));
        await this._setSignedList(documento_id, signedList);

        // Recalcular obtenidas (evita duplicados)
        const uniqueSigned = Array.from(new Set(signedList.map(Number)));
        const nuevasObtenidas = uniqueSigned.length;

        // Actualizar Documento: firmas_obtenidas + estado
        // Estado: cuando ya hay >=1 firma -> FIRMA_PARCIAL
        // Si alcanza requeridas, igual queda FIRMA_PARCIAL pero ya cumple por conteo
        await pool.query(
            `UPDATE Documento
             SET firmas_obtenidas = ?,
                 estado = CASE
                   WHEN ? >= 1 THEN 'FIRMA_PARCIAL'
                   ELSE estado
                 END
             WHERE id = ?`,
            [nuevasObtenidas, nuevasObtenidas, Number(documento_id)]
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
                firmas_requeridas: info.firmas_requeridas,
            },
        });

        return {
            ok: true,
            documento_id,
            estado: "FIRMA_PARCIAL",
            firmas_obtenidas: nuevasObtenidas,
            firmas_requeridas: info.firmas_requeridas,
        };
    },

    // =========================
    // Descarga para firma (MVP)
    // =========================

    /**
     * Descargar PDF para firmar (MVP)
     * - Genera un PDF sencillo (texto) basado en el HTML
     * - Recomendado real: Puppeteer para conservar formato
     */
    async downloadPdfForSignature({ documento_id, usuario_id }) {
        // validar acceso
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

        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        // Convertir HTML -> texto básico (MVP)
        const html = String(doc.contenido || "");
        const text = html
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<\/h\d>/gi, "\n\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        // PDFKit (si no está: npm i pdfkit)
        const PDFDocument = (await import("pdfkit")).default;

        const pdf = new PDFDocument({ margin: 50 });
        const chunks = [];
        pdf.on("data", (c) => chunks.push(c));

        const bufferPromise = new Promise((resolve, reject) => {
            pdf.on("end", () => resolve(Buffer.concat(chunks)));
            pdf.on("error", reject);
        });

        pdf.fontSize(16).text(doc.titulo || "Documento", { underline: true });
        pdf.moveDown();
        pdf.fontSize(11).text(text || "(Sin contenido)");
        pdf.end();

        const buffer = await bufferPromise;

        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        return {
            filename: `${safeTitle}_${documento_id}.pdf`,
            buffer,
        };
    },

    /**
     * Descargar "DOC" para firmar (MVP)
     * - Word abre HTML como documento
     * - DOCX real requiere librería de generación (p.ej. docx)
     */
    async downloadDocxForSignature({ documento_id, usuario_id }) {
        // validar acceso
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

        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const html = String(doc.contenido || "");
        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        // Esto no es DOCX real, pero Word lo abre perfecto como .doc
        const buffer = Buffer.from(html, "utf8");

        return {
            filename: `${safeTitle}_${documento_id}.doc`,
            buffer,
        };
    },

};

// src/routes/documento.routes.js
import { Router } from "express";
import { documentoService } from "../services/documento.service.js";
import { eadExportService } from "../services/eadExport.service.js";
import { authGuard } from "../middleware/authGuard.js";
import { editSessionService } from "../services/editSession.service.js";
import { uploadSignedPdf } from "../middleware/uploadSignedPdf.js";
import { uploadMassivePdf } from "../middleware/uploadMassivePdf.js";
import { uploadAnexo } from "../middleware/uploadAnexo.js";
import { pool } from "../db/pool.js";
import multer from "multer";

const maxMassivePdfFiles = Number(process.env.MAX_MASSIVE_PDF_FILES || 100);

const documentoRoutes = Router();

const importDocxUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

/** ============================
 *  🔒 TODAS LAS RUTAS CON AUTHGUARD
 *  ============================ */

/** HU-035: listar documentos archivados exportables a EAD 2002 */
documentoRoutes.get(
    "/documentos/conservacion/ead2002",
    authGuard,
    async (req, res) => {
        try {
            const rows = await eadExportService.listExportableDocuments(
                req.query,
                req.actor || req.user,
            );
            return res.json(rows);
        } catch (e) {
            const code =
                e.code === "UNAUTHORIZED" ? 401 : e.code === "FORBIDDEN" ? 403 : 500;

            return res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

/** HU-035: vista previa de exportación EAD 2002 */
documentoRoutes.get(
    "/documentos/:id/ead2002/preview",
    authGuard,
    async (req, res) => {
        try {
            const documento_id = Number(req.params.id);
            const out = await eadExportService.getPreview(
                documento_id,
                req.actor || req.user,
            );
            return res.json(out);
        } catch (e) {
            const code =
                e.code === "UNAUTHORIZED"
                    ? 401
                    : e.code === "FORBIDDEN"
                        ? 403
                        : e.code === "NOT_FOUND"
                            ? 404
                            : 500;

            return res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

/** HU-035: descargar XML EAD 2002 */
documentoRoutes.get(
    "/documentos/:id/ead2002/export",
    authGuard,
    async (req, res) => {
        try {
            const documento_id = Number(req.params.id);
            const { filename, mimeType, buffer } = await eadExportService.exportXml(
                documento_id,
                req.actor || req.user,
            );

            res.setHeader(
                "Content-Type",
                mimeType || "application/xml; charset=utf-8",
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`,
            );
            res.setHeader("Content-Length", buffer.length);

            return res.status(200).end(buffer);
        } catch (e) {
            const code =
                e.code === "UNAUTHORIZED"
                    ? 401
                    : e.code === "FORBIDDEN"
                        ? 403
                        : e.code === "NOT_FOUND"
                            ? 404
                            : e.code === "INCOMPLETE_EAD_EXPORT"
                                ? 422
                                : 500;

            return res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
                ...(e.detail ? { detail: e.detail } : {}),
            });
        }
    },
);

/** Editar un documento */
documentoRoutes.patch("/documentos/:id", authGuard, async (req, res) => {
    try {
        const userId = req.user.id;
        const documentId = Number(req.params.id);
        const { content } = req.body;

        const updatedDocument = await documentoService.editDocument(
            userId,
            documentId,
            content,
        );
        res.json(updatedDocument);
    } catch (e) {
        const code =
            e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 500;

        res
            .status(code)
            .json({ error: e.code ?? "internal_error", message: e.message });
    }
});

/** HU-007: crear documento desde plantilla */
documentoRoutes.post(
    "/documentos/crear-desde-plantilla",
    authGuard,
    async (req, res) => {
        try {
            const userId = req.user.id;
            const unidadId =
                req.user.unidadId || req.user.unidad_id || req.body.unidad_id;
            const { plantilla_id, titulo, categoria_id, confid_level } = req.body;

            const result = await documentoService.createFromPlantilla({
                plantilla_id,
                titulo,
                categoria_id: categoria_id ?? null,
                confid_level: confid_level ?? "INTERNAL",
                usuario_id: userId,
                unidad_id: unidadId,
            });

            res.status(201).json(result);
        } catch (e) {
            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

/** Importar DOCX a HTML incluyendo encabezado/pie */
documentoRoutes.post(
    "/documentos/import-docx",
    authGuard,
    importDocxUpload.single("file"),
    async (req, res) => {
        try {
            const uploaded = req.file;
            if (!uploaded?.buffer) {
                return res.status(400).json({
                    error: "BAD_REQUEST",
                    message: "Debe adjuntar un archivo DOCX (campo: file).",
                });
            }

            const ext = String(uploaded.originalname || "").toLowerCase();
            if (!ext.endsWith(".docx")) {
                return res.status(400).json({
                    error: "BAD_REQUEST",
                    message: "El archivo debe ser .docx",
                });
            }

            const out = await documentoService.importDocxToHtml({
                fileBuffer: uploaded.buffer,
            });

            return res.json(out);
        } catch (e) {
            const code = e.code === "BAD_REQUEST" ? 400 : 500;
            return res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

/** Obtener documentos accesibles al usuario autenticado */
documentoRoutes.get("/view/production", authGuard, async (req, res) => {
    try {
        const userId = req.user.id;
        const documents = await documentoService.getAccessibleDocuments(userId);
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: "internal_error", message: error.message });
    }
});

/** HU-007/HU-017: preparar documento para firma */
documentoRoutes.put(
    "/documentos/:id/preparar-firma",
    authGuard,
    async (req, res) => {
        try {
            const userId = Number(req.actor?.id ?? req.user?.id);
            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(401).json({
                    error: "unauthorized",
                    message: "Sesión inválida: identidad de usuario no disponible",
                });
            }

            const documento_id = Number(req.params.id);

            const rawFirmantes = req.body?.firmantesIds ?? req.body?.firmantes ?? [];
            const firmantesIds = Array.isArray(rawFirmantes) ? rawFirmantes : [];

            const fecha_limite = req.body.fecha_limite ?? null;

            const result = await documentoService.prepareForSignature({
                documento_id,
                usuario_id: userId,
                firmantesIds,
                fecha_limite,
            });

            res.json(result);
        } catch (e) {
            const code =
                e.code === "BAD_REQUEST"
                    ? 400
                    : e.code === "NOT_FOUND"
                        ? 404
                        : e.code === "STATE_ERROR"
                            ? 409
                            : 500;

            res
                .status(code)
                .json({ error: e.code ?? "internal_error", message: e.message });
        }
    },
);

/** HU-020: Archivar documento (sin bloqueo por validación de firma digital) */
documentoRoutes.put("/documentos/:id/archivar", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);

        const out = await documentoService.archiveDocument({
            documento_id,
            usuario_id,
        });

        res.json(out);
    } catch (e) {
        const code =
            e.code === "FORBIDDEN"
                ? 403
                : e.code === "NOT_FOUND"
                    ? 404
                    : e.code === "STATE_ERROR"
                        ? 409
                        : 500;

        res
            .status(code)
            .json({ error: e.code ?? "internal_error", message: e.message });
    }
});

/** HU-008: obtener última versión */
documentoRoutes.get(
    "/documentos/:id/version/latest",
    authGuard,
    async (req, res) => {
        try {
            const data = await documentoService.getLatestVersion(
                Number(req.params.id),
            );
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

/** HU-008: guardar colaborativamente */
documentoRoutes.put(
    "/documentos/:id/colab-guardar",
    authGuard,
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const documento_id = Number(req.params.id);
            const contenido =
                req.body?.contenido ?? req.body?.content ?? req.body?.html ?? "";

            const base_version_id = Number(
                req.body?.base_version_id ??
                req.body?.baseVersionId ??
                req.body?.baseVersionID ??
                0,
            );

            const result = await documentoService.colabSave({
                documento_id,
                usuario_id,
                contenido,
                base_version_id,
            });

            res.json(result);
        } catch (e) {
            if (e.code === "VERSION_CONFLICT") {
                return res
                    .status(409)
                    .json({ error: "version_conflict", details: e.details });
            }

            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

/** HU-008: adquirir lock de edición */
documentoRoutes.post("/documentos/:id/lock", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);
        const ttlSeconds = Number(req.body.ttlSeconds) || 180;

        const out = await documentoService.acquireLock({
            documento_id,
            usuario_id,
            ttlSeconds,
        });

        res.json(out);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: liberar lock de edición */
documentoRoutes.delete("/documentos/:id/lock", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);

        await documentoService.releaseLock({ documento_id, usuario_id });
        res.status(204).end();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: leer lock actual */
documentoRoutes.get("/documentos/:id/lock", authGuard, async (req, res) => {
    try {
        const lock = await documentoService.readLock(Number(req.params.id));
        res.json(lock || null);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-016: listar comentarios */
documentoRoutes.get(
    "/documentos/:id/comentarios",
    authGuard,
    async (req, res) => {
        try {
            const rows = await documentoService.listComentarios(
                Number(req.params.id),
            );
            res.json(rows);
        } catch (e) {
            return res.status(500).json({
                error: "internal_error",
                message: e?.message ?? String(e),
                stack: e?.stack ?? null,
            });
        }
    },
);

/** HU-016: agregar comentario */
documentoRoutes.post(
    "/documentos/:id/comentarios",
    authGuard,
    async (req, res) => {
        try {
            const documento_id = Number(req.params.id);
            const usuario_id = req.user.id;
            const { descripcion } = req.body;

            const result = await documentoService.addComentario({
                documento_id,
                usuario_id,
                descripcion,
            });

            res.status(201).json(result);
        } catch (e) {
            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

/** HU-016: marcar comentario como resuelto */
documentoRoutes.patch(
    "/comentarios/:comentarioId/resolver",
    authGuard,
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const comentario_id = Number(req.params.comentarioId);

            const out = await documentoService.resolveComentario({
                comentario_id,
                usuario_id,
            });

            res.json(out);
        } catch (e) {
            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

/** HU-008: sesiones colaborativas */
documentoRoutes.post(
    "/documentos/:id/sessions",
    authGuard,
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const documento_id = Number(req.params.id);

            const out = await editSessionService.touch(documento_id, usuario_id);
            res.json(out);
        } catch (e) {
            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

documentoRoutes.get("/documentos/:id/sessions", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuarios = await editSessionService.list(documento_id, 60);

        res.json(usuarios);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

documentoRoutes.delete(
    "/documentos/:id/sessions",
    authGuard,
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const documento_id = Number(req.params.id);

            await editSessionService.remove(documento_id, usuario_id);
            res.status(204).end();
        } catch (e) {
            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

// HU-010: Restaurar una versión anterior
documentoRoutes.post(
    "/documentos/:id/restaurar-version/:versionId",
    authGuard,
    async (req, res) => {
        try {
            const { id, versionId } = req.params;
            const { motivo } = req.body;
            const usuario_id = req.user.id;

            const out = await documentoService.restoreVersion({
                documento_id: Number(id),
                version_id: Number(versionId),
                usuario_id,
                motivo,
            });

            res.json(out);
        } catch (e) {
            const code = e.code === "NOT_FOUND" ? 404 : 500;

            res
                .status(code)
                .json({ error: "ERROR_RESTAURAR_VERSION", message: e.message });
        }
    },
);

// Listar versiones del documento
documentoRoutes.get(
    "/documentos/:id/versiones",
    authGuard,
    async (req, res) => {
        try {
            const list = await documentoService.listVersions(Number(req.params.id));
            res.json(list);
        } catch (e) {
            res
                .status(500)
                .json({ error: "ERROR_LISTAR_VERSIONES", message: e.message });
        }
    },
);

// =========================
// 📎 ANEXOS
// =========================
const uploadAnexosHandler = (req, res) => {
    uploadAnexo.any()(req, res, async (err) => {
        if (err) {
            const maxMb = Number(process.env.MAX_ANEXO_MB) || 100;

            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({
                    error: "FILE_TOO_LARGE",
                    message: `El archivo supera el tamaño máximo permitido (${maxMb}MB).`,
                });
            }

            if (err.code === "LIMIT_FILE_COUNT") {
                return res.status(400).json({
                    error: "TOO_MANY_FILES",
                    message: "Demasiados archivos en la solicitud.",
                });
            }

            return res.status(400).json({
                error: "UPLOAD_ERROR",
                message: err.message || "No se pudo subir el anexo.",
            });
        }

        try {
            const documento_id = Number(req.params.id);
            const usuario_id = req.user.id;
            const descripcion = req.body?.descripcion ?? null;
            const files = req.files || [];

            if (!files.length) {
                return res.status(400).json({
                    error: "BAD_REQUEST",
                    message: "Debe adjuntar al menos un archivo (FormData).",
                });
            }

            const created = [];

            for (const file of files) {
                created.push(
                    await documentoService.addAnexo({
                        documento_id,
                        usuario_id,
                        file,
                        descripcion,
                    }),
                );
            }

            if (created.length === 1) {
                return res.status(201).json(created[0]);
            }

            return res.status(201).json({ anexos: created });
        } catch (e) {
            const code =
                e.code === "BAD_REQUEST"
                    ? 400
                    : e.code === "FORBIDDEN"
                        ? 403
                        : e.code === "NOT_FOUND"
                            ? 404
                            : e.code === "STATE_ERROR"
                                ? 409
                                : 500;

            return res
                .status(code)
                .json({ error: e.code ?? "internal_error", message: e.message });
        }
    });
};

documentoRoutes.post("/documentos/:id/anexos", authGuard, uploadAnexosHandler);
documentoRoutes.post("/documentos/:id/anexo", authGuard, uploadAnexosHandler);

documentoRoutes.get("/documentos/:id/anexos", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuario_id = req.user.id;

        const list = await documentoService.listAnexos({
            documento_id,
            usuario_id,
        });

        res.json(list);
    } catch (e) {
        const code =
            e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 500;

        res
            .status(code)
            .json({ error: e.code ?? "internal_error", message: e.message });
    }
});

documentoRoutes.get("/documentos/:id/anexo", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuario_id = req.user.id;

        const list = await documentoService.listAnexos({
            documento_id,
            usuario_id,
        });

        res.json(list);
    } catch (e) {
        const code =
            e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 500;

        res
            .status(code)
            .json({ error: e.code ?? "internal_error", message: e.message });
    }
});

const downloadAnexoDocumentoHandler = async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const anexo_id = Number(req.params.anexo_id);
        const usuario_id = req.user.id;

        const { filename, mime_type, buffer } = await documentoService.getAnexoFile({
            documento_id,
            anexo_id,
            usuario_id,
        });

        res.setHeader("Content-Type", mime_type || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", buffer.length);

        return res.status(200).end(buffer);
    } catch (e) {
        const code =
            e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 500;

        return res
            .status(code)
            .json({ error: e.code ?? "internal_error", message: e.message });
    }
};

/** Descarga binaria (mismo comportamiento que GET sin sufijo). */
documentoRoutes.get(
    "/documentos/:id/anexos/:anexo_id",
    authGuard,
    downloadAnexoDocumentoHandler,
);

/** Alias esperado por el frontend (`.../anexos/:id/descargar`). */
documentoRoutes.get(
    "/documentos/:id/anexos/:anexo_id/descargar",
    authGuard,
    downloadAnexoDocumentoHandler,
);

documentoRoutes.delete(
    "/documentos/:id/anexos/:anexo_id",
    authGuard,
    async (req, res) => {
        try {
            const documento_id = Number(req.params.id);
            const anexo_id = Number(req.params.anexo_id);
            const usuario_id = req.user.id;

            const out = await documentoService.deleteAnexo({
                documento_id,
                anexo_id,
                usuario_id,
            });

            res.json(out);
        } catch (e) {
            const code =
                e.code === "FORBIDDEN"
                    ? 403
                    : e.code === "NOT_FOUND"
                        ? 404
                        : e.code === "STATE_ERROR"
                            ? 409
                            : 500;

            res
                .status(code)
                .json({ error: e.code ?? "internal_error", message: e.message });
        }
    },
);

documentoRoutes.delete(
    "/documentos/:id/anexo/:anexo_id",
    authGuard,
    async (req, res) => {
        try {
            const documento_id = Number(req.params.id);
            const anexo_id = Number(req.params.anexo_id);
            const usuario_id = req.user.id;

            const out = await documentoService.deleteAnexo({
                documento_id,
                anexo_id,
                usuario_id,
            });

            res.json(out);
        } catch (e) {
            const code =
                e.code === "FORBIDDEN"
                    ? 403
                    : e.code === "NOT_FOUND"
                        ? 404
                        : e.code === "STATE_ERROR"
                            ? 409
                            : 500;

            res
                .status(code)
                .json({ error: e.code ?? "internal_error", message: e.message });
        }
    },
);

/** HU-021: Carga masiva de PDFs archivados con anexos opcionales */
documentoRoutes.post(
    "/documentos/carga-masiva/pdf",
    authGuard,
    (req, res, next) => {
        uploadMassivePdf.any()(req, res, (err) => {
            if (!err) return next();

            console.error("=== ERROR MULTER / CARGA MASIVA PDF ===");
            console.error("message:", err?.message);
            console.error("code:", err?.code);
            console.error("stack:", err?.stack);
            console.error("full error:", err);

            let status = 400;
            let error = "UPLOAD_ERROR";
            let message = err?.message || "Error al subir archivos";

            if (err?.code === "LIMIT_FILE_SIZE") {
                const maxMb = Number(process.env.MAX_MASSIVE_PDF_MB || 150);
                status = 413;
                error = "FILE_TOO_LARGE";
                message = `Uno de los archivos supera el tamaño máximo permitido (${maxMb} MB por archivo).`;
            } else if (err?.code === "LIMIT_FILE_COUNT") {
                const maxFiles = Number(process.env.MAX_MASSIVE_PDF_FILES || 100);
                status = 400;
                error = "TOO_MANY_FILES";
                message = `Se excedió la cantidad máxima permitida de archivos (${maxFiles}).`;
            } else if (err?.code === "LIMIT_UNEXPECTED_FILE") {
                status = 400;
                error = "UNEXPECTED_FILE";
                message = "Se recibió un archivo en un campo no esperado.";
            } else if (err?.code === "BAD_FILE_TYPE") {
                status = 400;
                error = "BAD_FILE_TYPE";
                message =
                    err.message ||
                    "Solo se permiten archivos PDF como documento principal.";
            } else if (err?.code === "BAD_ANEXO_TYPE") {
                status = 400;
                error = "BAD_ANEXO_TYPE";
                message =
                    err.message ||
                    "Formato de anexo no permitido. Se permiten PDF, Word, Excel, PowerPoint, imágenes, TXT, CSV o ZIP.";
            }

            return res.status(status).json({
                error,
                message,
                debug: {
                    stage: "multer",
                    code: err?.code ?? null,
                    name: err?.name ?? null,
                },
            });
        });
    },
    async (req, res) => {
        const parseMaybeJson = (value) => {
            if (value == null || value === "") return null;
            if (typeof value === "object") return value;
            if (typeof value !== "string") return null;

            try {
                return JSON.parse(value);
            } catch {
                return null;
            }
        };

        try {
            const usuario_id = req.user?.id;

            const unidad_id =
                req.user?.unidadId ||
                req.user?.unidad_id ||
                req.body?.unidad_id;

            const categoria_id = req.body?.categoria_id
                ? Number(req.body.categoria_id)
                : null;

            const origen_documento = req.body?.origen_documento;

            const metadata_por_documento = parseMaybeJson(
                req.body?.metadata_por_documento ??
                req.body?.metadataPorDocumento ??
                req.body?.documentos_metadata,
            );

            const metadata_lote = parseMaybeJson(
                req.body?.metadata_lote ??
                req.body?.metadataLote ??
                req.body?.metadata,
            );

            const uploadedFiles = req.files || [];

            const files = uploadedFiles.filter(
                (file) => file.fieldname === "files",
            );

            const anexos_por_documento = {};

            for (const file of uploadedFiles) {
                const match = /^anexos_(\d+)$/.exec(file.fieldname || "");

                if (!match) continue;

                const index = Number(match[1]);

                if (!anexos_por_documento[index]) {
                    anexos_por_documento[index] = [];
                }

                anexos_por_documento[index].push(file);
            }

            if (files.length > maxMassivePdfFiles) {
                return res.status(400).json({
                    error: "TOO_MANY_FILES",
                    message: `Solo se permiten ${maxMassivePdfFiles} documentos principales por lote.`,
                    total_recibidos: files.length,
                    total_rechazados: files.length,
                    errores: files.map((file) => ({
                        archivo: file.originalname,
                        motivo: `El lote supera el máximo permitido de ${maxMassivePdfFiles} documentos principales.`,
                    })),
                });
            }

            console.log("=== INICIO CARGA MASIVA PDF ===");
            console.log("usuario_id:", usuario_id);
            console.log("unidad_id:", unidad_id);
            console.log("categoria_id:", categoria_id);
            console.log("origen_documento:", origen_documento);
            console.log("body keys:", Object.keys(req.body || {}));
            console.log(
                "metadata_por_documento tipo:",
                typeof metadata_por_documento,
            );
            console.log("metadata_lote tipo:", typeof metadata_lote);

            console.log(
                "documentos principales:",
                files.map((f, index) => ({
                    index,
                    fieldname: f.fieldname,
                    originalname: f.originalname,
                    mimetype: f.mimetype,
                    size: f.size,
                    filename: f.filename ?? null,
                    path: f.path ?? null,
                })),
            );

            console.log(
                "anexos_por_documento:",
                Object.fromEntries(
                    Object.entries(anexos_por_documento).map(([index, anexos]) => [
                        index,
                        anexos.map((a) => ({
                            fieldname: a.fieldname,
                            originalname: a.originalname,
                            mimetype: a.mimetype,
                            size: a.size,
                            filename: a.filename ?? null,
                            path: a.path ?? null,
                        })),
                    ]),
                ),
            );

            if (!usuario_id) {
                return res.status(401).json({
                    error: "UNAUTHORIZED",
                    message: "No se pudo identificar el usuario autenticado.",
                    debug: { stage: "pre-validation" },
                });
            }

            if (!files.length) {
                return res.status(400).json({
                    error: "BAD_REQUEST",
                    message: "Debe adjuntar al menos un PDF en el campo files.",
                    debug: { stage: "pre-validation" },
                });
            }

            const maxTotalMb = Number(process.env.MAX_MASSIVE_PDF_TOTAL_MB || 1024);
            const totalBytes = files.reduce(
                (sum, f) => sum + Number(f?.size || 0),
                0,
            );
            const maxTotalBytes = maxTotalMb * 1024 * 1024;

            if (totalBytes > maxTotalBytes) {
                return res.status(413).json({
                    error: "TOTAL_BATCH_TOO_LARGE",
                    message: `El lote supera el tamaño máximo permitido (${maxTotalMb} MB en total).`,
                    debug: {
                        stage: "pre-validation",
                        totalFiles: files.length,
                        totalBytes,
                    },
                });
            }

            const out = await documentoService.importArchivedPdfs({
                files,
                anexos_por_documento,
                usuario_id,
                unidad_id,
                categoria_id,
                origen_documento,
                metadata_por_documento,
                metadata_lote,
            });

            console.log("=== CARGA MASIVA PDF EXITOSA ===");
            console.log("resultado:", out);

            return res.status(201).json(out);
        } catch (e) {
            console.error("=== ERROR EN /documentos/carga-masiva/pdf ===");
            console.error("message:", e?.message);
            console.error("code:", e?.code);
            console.error("name:", e?.name);
            console.error("stack:", e?.stack);
            console.error("full error:", e);

            const files = (req.files || []).filter(
                (file) => file.fieldname === "files",
            );

            const code =
                e?.code === "BAD_REQUEST"
                    ? 400
                    : e?.code === "FORBIDDEN"
                        ? 403
                        : e?.code === "NOT_FOUND"
                            ? 404
                            : e?.code === "CONFLICT" || e?.code === "ER_DUP_ENTRY"
                                ? 409
                                : 500;

            return res.status(code).json({
                error: e?.code ?? "internal_error",
                message: e?.message ?? "Error interno al importar PDFs archivados.",
                debug: {
                    stage: "service",
                    errorName: e?.name ?? null,
                    totalFiles: files.length,
                    files: files.map((f, index) => ({
                        index,
                        originalname: f.originalname,
                        mimetype: f.mimetype,
                        size: f.size,
                    })),
                },
            });
        }
    },
);

/** ============================
 *  📄 RUTAS PÚBLICAS / DE LECTURA
 *  ============================ */

/** Listar todos los documentos */
documentoRoutes.get("/", async (_req, res) => {
    try {
        const documents = await documentoService.getAllDocuments();
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: "internal_error", message: error.message });
    }
});

/** Vista de documentos en producción */
documentoRoutes.get("/production", async (_req, res) => {
    try {
        const documents = await documentoService.getDocumentsFromProduction();
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: "internal_error", message: error.message });
    }
});

documentoRoutes.get(
    "/documentos/:id/contenido",
    authGuard,
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const documento_id = Number(req.params.id);

            await documentoService.assertExternalDocumentAccessIfNeeded({
                documento_id,
                user: req.user,
            });

            const out = await documentoService.getContenido({
                documento_id,
                usuario_id,
                skipAccessCheck: documentoService.isExternalUser(req.user),
            });

            res.json(out);
        } catch (e) {
            if (e.code === "FORBIDDEN") {
                return res.status(403).json({ error: "forbidden", message: e.message });
            }

            if (e.code === "NOT_FOUND") {
                return res.status(404).json({ error: "not_found", message: e.message });
            }

            res.status(500).json({ error: "internal_error", message: e.message });
        }
    },
);

/** HU-018/HU-017: info para firmar */
documentoRoutes.get(
    "/documentos/:id/firma/info",
    authGuard,
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const documento_id = Number(req.params.id);

            const out = await documentoService.getSignatureInfo({
                documento_id,
                usuario_id,
            });

            res.json(out);
        } catch (e) {
            const code =
                e.code === "FORBIDDEN"
                    ? 403
                    : e.code === "NOT_FOUND"
                        ? 404
                        : e.code === "STATE_ERROR"
                            ? 409
                            : 500;

            res
                .status(code)
                .json({ error: e.code ?? "internal_error", message: e.message });
        }
    },
);

/** Descargar PDF para firma */
documentoRoutes.get(
    "/documentos/:id/firma/descargar/pdf",
    authGuard,
    async (req, res) => {
        try {
            const documento_id = Number(req.params.id);
            const usuario_id = Number(req.user?.id);

            await documentoService.assertFirmaPdfDownloadAccess({
                documento_id,
                usuario_id,
                user: req.user,
            });

            const { filename, buffer } =
                await documentoService.downloadPdfForSignature({
                    documento_id,
                    usuario_id,
                    skipAccessCheck: true,
                });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`,
            );
            res.setHeader("Content-Length", buffer.length);

            return res.status(200).end(buffer);
        } catch (err) {
            const code =
                err.code === "FORBIDDEN"
                    ? 403
                    : err.code === "NOT_FOUND"
                        ? 404
                        : err.code === "BAD_REQUEST"
                            ? 400
                            : err.code === "STATE_ERROR"
                                ? 409
                                : 500;

            return res.status(code).json({
                error: err.code ?? "internal_error",
                message: err?.message || "Error descargando PDF",
            });
        }
    },
);

/** Descargar DOCX para firma */
documentoRoutes.get(
    "/documentos/:id/firma/descargar/docx",
    authGuard,
    async (req, res) => {
        try {
            const documento_id = Number(req.params.id);
            const usuario_id = Number(req.user?.id);

            const { filename, buffer } =
                await documentoService.downloadDocxForSignature({
                    documento_id,
                    usuario_id,
                });

            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`,
            );
            res.setHeader("Content-Length", buffer.length);

            return res.status(200).end(buffer);
        } catch (err) {
            return res.status(500).json({
                error: "internal_error",
                message: err?.message || "Error descargando DOCX",
            });
        }
    },
);

/** ✅ Ver/descargar PDF firmado actual del documento */
documentoRoutes.get(
    "/documentos/:id/firma/pdf-actual",
    authGuard,
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const documento_id = Number(req.params.id);

            const { filename, buffer } = await documentoService.getCurrentSignedPdf({
                documento_id,
                usuario_id,
            });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
            res.setHeader("Content-Length", buffer.length);

            return res.status(200).end(buffer);
        } catch (e) {
            const code =
                e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 500;

            res
                .status(code)
                .json({ error: e.code ?? "internal_error", message: e.message });
        }
    },
);

/** Confirmar firma (subir PDF firmado) */
documentoRoutes.post(
    "/documentos/:id/firma/confirmar",
    authGuard,
    uploadSignedPdf.single("file"),
    async (req, res) => {
        try {
            const usuario_id = req.user.id;
            const documento_id = Number(req.params.id);

            if (!req.file?.path) {
                return res.status(400).json({
                    error: "BAD_REQUEST",
                    message: "Debe adjuntar un PDF firmado (campo: file)",
                });
            }

            const out = await documentoService.confirmSignature({
                documento_id,
                usuario_id,
                signedPdfPath: req.file.path,
            });

            res.json(out);
        } catch (e) {
            const code =
                e.code === "BAD_REQUEST"
                    ? 400
                    : e.code === "FORBIDDEN"
                        ? 403
                        : e.code === "NOT_FOUND"
                            ? 404
                            : e.code === "STATE_ERROR"
                                ? 409
                                : 500;

            res
                .status(code)
                .json({ error: e.code ?? "internal_error", message: e.message });
        }
    },
);

documentoRoutes.get(
    "/documentos/pendientes-clasificacion",
    async (_req, res) => {
        try {
            const query = `
        SELECT
          d.id,
          d.titulo,
          d.numero_serie,
          d.estado,
          e.nombre AS expediente
        FROM Documento d
        LEFT JOIN Expediente e ON d.expediente_id = e.id
        WHERE d.expediente_id IS NOT NULL
        ORDER BY d.fecha DESC
      `;

            const [rows] = await pool.query(query);
            res.status(200).json(rows);
        } catch (error) {
            res.status(500).json({ error: "internal_error", message: error.message });
        }
    },
);

documentoRoutes.get("/documentos/externos", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;

        const documents =
            await documentoService.getArchivedDocumentsForExternal(usuario_id);

        return res.json(documents);
    } catch (error) {
        return res.status(500).json({
            error: "internal_error",
            message: error.message,
        });
    }
});

documentoRoutes.get(
    "/documentos/expediente/:expedienteId",
    authGuard,
    async (req, res) => {
        try {
            const expedienteId = Number(req.params.expedienteId);
            const rows =
                await documentoService.getDocumentosByExpediente(expedienteId);

            res.status(200).json(rows);
        } catch (e) {
            const code = e.code === "BAD_REQUEST" ? 400 : 500;

            res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

export default documentoRoutes;
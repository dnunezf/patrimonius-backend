// src/routes/documento.routes.js
import { Router } from "express";
import { documentoService } from "../services/documento.service.js";
import { authGuard } from "../middleware/authGuard.js";
import { editSessionService } from "../services/editSession.service.js";
import { uploadSignedPdf } from "../middleware/uploadSignedPdf.js";

const documentoRoutes = Router();

/** ============================
 *  🔒 TODAS LAS RUTAS CON AUTHGUARD
 *  ============================ */

/** Editar un documento */
documentoRoutes.patch("/documentos/:id", authGuard, async (req, res) => {
    try {
        const userId = req.user.id;
        const documentId = Number(req.params.id);
        const { content } = req.body;

        const updatedDocument = await documentoService.editDocument(
            userId,
            documentId,
            content
        );
        res.json(updatedDocument);
    } catch (e) {
        const code =
            e.code === "FORBIDDEN"
                ? 403
                : e.code === "NOT_FOUND"
                    ? 404
                    : 500;

        res.status(code).json({ error: e.code ?? "internal_error", message: e.message });
    }
});

/** HU-007: crear documento desde plantilla */
documentoRoutes.post("/documentos/crear-desde-plantilla", authGuard, async (req, res) => {
    try {
        const userId = req.user.id;
        const unidadId = req.user.unidadId || req.user.unidad_id || req.body.unidad_id;
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
});

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
documentoRoutes.put("/documentos/:id/preparar-firma", authGuard, async (req, res) => {
    try {
        const userId = req.user.id;
        const documento_id = Number(req.params.id);

        const firmantesIds = Array.isArray(req.body.firmantesIds)
            ? req.body.firmantesIds.map(Number)
            : [];

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

        res.status(code).json({ error: e.code ?? "internal_error", message: e.message });
    }
});

/** HU-008: obtener última versión */
documentoRoutes.get("/documentos/:id/version/latest", authGuard, async (req, res) => {
    try {
        const data = await documentoService.getLatestVersion(Number(req.params.id));
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: guardar colaborativamente */
documentoRoutes.put("/documentos/:id/colab-guardar", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);
        const contenido =
            req.body?.contenido ??
            req.body?.content ??
            req.body?.html ??
            "";

        const base_version_id = Number(
            req.body?.base_version_id ??
            req.body?.baseVersionId ??
            req.body?.baseVersionID ??
            0
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
            return res.status(409).json({ error: "version_conflict", details: e.details });
        }
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: adquirir lock de edición */
documentoRoutes.post("/documentos/:id/lock", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);
        const ttlSeconds = Number(req.body.ttlSeconds) || 180;

        const out = await documentoService.acquireLock({ documento_id, usuario_id, ttlSeconds });
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
documentoRoutes.get("/documentos/:id/comentarios", authGuard, async (req, res) => {
    try {
        const rows = await documentoService.listComentarios(Number(req.params.id));
        res.json(rows);
    } catch (e) {
        return res.status(500).json({
            error: "internal_error",
            message: e?.message ?? String(e),
            stack: e?.stack ?? null,
        });
    }
});

/** HU-016: agregar comentario */
documentoRoutes.post("/documentos/:id/comentarios", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuario_id = req.user.id;
        const { descripcion } = req.body;

        const result = await documentoService.addComentario({ documento_id, usuario_id, descripcion });
        res.status(201).json(result);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-016: marcar comentario como resuelto */
documentoRoutes.patch("/comentarios/:comentarioId/resolver", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const comentario_id = Number(req.params.comentarioId);
        const out = await documentoService.resolveComentario({ comentario_id, usuario_id });
        res.json(out);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: sesiones colaborativas */
documentoRoutes.post("/documentos/:id/sessions", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);

        const out = await editSessionService.touch(documento_id, usuario_id);
        res.json(out);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

documentoRoutes.get("/documentos/:id/sessions", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuarios = await editSessionService.list(documento_id, 60);
        res.json(usuarios);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

documentoRoutes.delete("/documentos/:id/sessions", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);

        await editSessionService.remove(documento_id, usuario_id);
        res.status(204).end();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

// HU-010: Restaurar una versión anterior
documentoRoutes.post("/documentos/:id/restaurar-version/:versionId", authGuard, async (req, res) => {
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
        res.status(code).json({ error: "ERROR_RESTAURAR_VERSION", message: e.message });
    }
});

// Listar versiones del documento
documentoRoutes.get("/documentos/:id/versiones", authGuard, async (req, res) => {
    try {
        const list = await documentoService.listVersions(Number(req.params.id));
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "ERROR_LISTAR_VERSIONES", message: e.message });
    }
});

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

documentoRoutes.get("/documentos/:id/contenido", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);

        const out = await documentoService.getContenido({ documento_id, usuario_id });
        res.json(out);
    } catch (e) {
        if (e.code === "FORBIDDEN") return res.status(403).json({ error: "forbidden", message: e.message });
        if (e.code === "NOT_FOUND") return res.status(404).json({ error: "not_found", message: e.message });
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-018/HU-017: info para firmar */
documentoRoutes.get("/documentos/:id/firma/info", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const documento_id = Number(req.params.id);

        const out = await documentoService.getSignatureInfo({ documento_id, usuario_id });
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

        res.status(code).json({ error: e.code ?? "internal_error", message: e.message });
    }
});

/** Descargar PDF para firma */
documentoRoutes.get("/documentos/:id/firma/descargar/pdf", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuario_id = Number(req.user?.id);

        const { filename, buffer } = await documentoService.downloadPdfForSignature({
            documento_id,
            usuario_id,
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", buffer.length);

        return res.status(200).end(buffer);
    } catch (err) {
        return res.status(err?.status || 500).json({
            error: "internal_error",
            message: err?.message || "Error descargando PDF",
        });
    }
});

/** Descargar DOCX para firma */
documentoRoutes.get("/documentos/:id/firma/descargar/docx", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuario_id = Number(req.user?.id);

        const { filename, buffer } = await documentoService.downloadDocxForSignature({
            documento_id,
            usuario_id,
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", buffer.length);

        return res.status(200).end(buffer);
    } catch (err) {
        return res.status(500).json({
            error: "internal_error",
            message: err?.message || "Error descargando DOCX",
        });
    }
});

/** ✅ Ver/descargar PDF firmado actual del documento */
documentoRoutes.get("/documentos/:id/firma/pdf-actual", authGuard, async (req, res) => {
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
            e.code === "FORBIDDEN"
                ? 403
                : e.code === "NOT_FOUND"
                    ? 404
                    : 500;

        res.status(code).json({ error: e.code ?? "internal_error", message: e.message });
    }
});

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

            res.status(code).json({ error: e.code ?? "internal_error", message: e.message });
        }
    }
);

export default documentoRoutes;
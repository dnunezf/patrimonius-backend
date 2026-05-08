// src/routes/controlAcceso.routes.js
import { Router } from "express";
import { getAccessControl } from "../services/controlAcceso.service.js";
import { authGuard } from "../middleware/authGuard.js";
import { consultaAprobadosService } from "../services/consultaAprobados.service.js";
import { consultaDashboardService } from "../services/consultaDashboard.service.js";
import { documentoService } from "../services/documento.service.js";
import archiver from "archiver";

const router = Router();

function logRouteError(scope, error, extra = {}) {
    console.error(`[controlAcceso.routes] ${scope}`, {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
        ...extra,
    });
}

function sanitizeZipName(value, fallback) {
    const raw = String(value || fallback || "archivo").trim();
    const safe = raw.replace(/[/\\?*:|"<>]+/g, "_");
    return safe || String(fallback || "archivo");
}

/** HU-025: filtros dinámicos (antes de rutas /:id) */
router.get("/search-approved/filters", authGuard, async (req, res) => {
    try {
        const data = await consultaAprobadosService.listFilters({
            user: req.user,
            actor: req.actor,
            query: req.query,
        });
        res.json(data);
    } catch (e) {
        const code = e.code === "BAD_REQUEST" ? 400 : 500;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

/** HU-025: búsqueda paginada */
router.get("/search-approved", authGuard, async (req, res) => {
    try {
        const data = await consultaAprobadosService.search({
            user: req.user,
            actor: req.actor,
            query: req.query,
            req,
        });
        res.json(data);
    } catch (e) {
        const code = e.code === "BAD_REQUEST" ? 400 : 500;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

/** Panel usuario: resumen (recientes, novedades semana, descargas por documento) */
router.get("/consulta-dashboard/resumen", authGuard, async (req, res) => {
    try {
        const data = await consultaDashboardService.getResumen({
            user: req.user,
            actor: req.actor,
            query: req.query || {},
        });
        res.json(data);
    } catch (e) {
        const code = e.code === "BAD_REQUEST" ? 400 : 500;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

/** Historial paginado de actividad HU-025 (bitácora) */
router.get("/consulta-dashboard/historial", authGuard, async (req, res) => {
    try {
        const data = await consultaDashboardService.getHistorial({
            query: req.query,
            actor: req.actor,
        });
        res.json(data);
    } catch (e) {
        res.status(500).json({
            error: "internal_error",
            message: e.message,
        });
    }
});

/** Metadatos de documentos favoritos (ids) visibles para el usuario */
router.post("/consulta-dashboard/documentos-por-ids", authGuard, async (req, res) => {
    try {
        const data = await consultaDashboardService.getDocumentosPorIds({
            user: req.user,
            actor: req.actor,
            body: req.body || {},
        });
        res.json(data);
    } catch (e) {
        const code = e.code === "BAD_REQUEST" ? 400 : 500;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

router.get("/control-acceso", authGuard, async (req, res) => {
    try {
        console.log("✅ Entró a /documents/control-acceso", {
            query: req.query,
            user: req.user?.id,
        });

        const user = req.user;
        const data = await getAccessControl(user, req.query);
        res.json(data);
    } catch (err) {
        console.error("❌ Error en control de acceso:", err.message);
        res.status(500).json({
            error: "internal_error",
            message: "Error obteniendo control de acceso",
            detail: err.message,
        });
    }
});

router.get("/:id/preview-pdf", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        if (!Number.isFinite(documento_id) || documento_id <= 0) {
            return res.status(400).json({ error: "bad_request", message: "ID de documento inválido" });
        }
        await consultaAprobadosService.assertCanAccess({
            user: req.user,
            actor: req.actor,
            documentoId: documento_id,
            req,
            accion: "VISTA_PREVIA",
        });
        const { filename, buffer } = await documentoService.getPdfBufferForConsultaPreview({
            documento_id,
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).end(buffer);
    } catch (e) {
        let code = 500;
        if (e.code === "FORBIDDEN") code = 403;
        else if (e.code === "NOT_FOUND") code = 404;
        else if (e.code === "BAD_REQUEST") code = 400;
        else if (e.code === "STATE_ERROR") code = 409;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

/** HU-025: vista previa (contenido / metadatos) — después de rutas literales */
router.get("/:id/preview", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        if (!Number.isFinite(documento_id) || documento_id <= 0) {
            return res.status(400).json({ error: "bad_request", message: "ID de documento inválido" });
        }
        await consultaAprobadosService.assertCanAccess({
            user: req.user,
            actor: req.actor,
            documentoId: documento_id,
            req,
            accion: "VISTA_PREVIA",
        });
        const out = await documentoService.getContenido({
            documento_id,
            usuario_id: req.user.id,
            skipAccessCheck: true,
        });
        res.json(out);
    } catch (e) {
        const code =
            e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 500;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

/** HU-025: descarga PDF (versión vigente / generada) */
router.get("/:id/download", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        if (!Number.isFinite(documento_id) || documento_id <= 0) {
            return res.status(400).json({ error: "bad_request", message: "ID de documento inválido" });
        }
        await consultaAprobadosService.assertCanAccess({
            user: req.user,
            actor: req.actor,
            documentoId: documento_id,
            req,
            accion: "DESCARGA",
        });
        const anexos = await documentoService.listAnexosParaConsulta({ documento_id });
        const { filename, buffer } = await documentoService.getPdfBufferForConsultaPreview({
            documento_id,
        });
        if (!Array.isArray(anexos) || anexos.length === 0) {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Length", buffer.length);
            return res.status(200).end(buffer);
        }

        const zipName = sanitizeZipName(filename, `documento_${documento_id}`)
            .replace(/\.pdf$/i, "") + ".zip";
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
        res.setHeader("Cache-Control", "private, no-store");

        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", (err) => {
            if (!res.headersSent) {
                res.status(500).json({
                    error: "internal_error",
                    message: err?.message || "Error creando ZIP de descarga",
                });
            } else {
                res.destroy(err);
            }
        });
        archive.pipe(res);
        archive.append(buffer, {
            name: sanitizeZipName(filename, `documento_${documento_id}.pdf`),
        });
        for (const anexo of anexos) {
            const anexoId = Number(anexo?.id);
            if (!Number.isFinite(anexoId) || anexoId <= 0) continue;
            const file = await documentoService.getAnexoFileParaConsulta({
                documento_id,
                anexo_id: anexoId,
            });
            archive.append(file.buffer, {
                name: `anexos/${sanitizeZipName(file.filename, `anexo_${anexoId}`)}`,
            });
        }
        await archive.finalize();
        return;
    } catch (e) {
        logRouteError("download", e, {
            documentoId: req.params.id,
            actorId: req.actor?.id ?? req.user?.id ?? null,
        });
        let code = 500;
        if (e.code === "FORBIDDEN") code = 403;
        else if (e.code === "NOT_FOUND") code = 404;
        else if (e.code === "BAD_REQUEST") code = 400;
        else if (e.code === "STATE_ERROR") code = 409;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

/**  listar anexos del documento (mismo acceso que vista previa). */
router.get("/:id/anexos", authGuard, async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        if (!Number.isFinite(documento_id) || documento_id <= 0) {
            return res.status(400).json({
                error: "bad_request",
                message: "ID de documento inválido",
            });
        }
        await consultaAprobadosService.assertCanAccess({
            user: req.user,
            actor: req.actor,
            documentoId: documento_id,
            req,
            accion: "VISTA_PREVIA",
        });
        const list = await documentoService.listAnexosParaConsulta({ documento_id });
        return res.json(list);
    } catch (e) {
        let code = 500;
        if (e.code === "FORBIDDEN") code = 403;
        else if (e.code === "NOT_FOUND") code = 404;
        else if (e.code === "BAD_REQUEST") code = 400;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

/** HU-025: descargar anexo (misma bitácora / reglas que descarga del PDF). */
async function handleConsultaAnexoDescarga(req, res) {
    try {
        const documento_id = Number(req.params.id);
        const anexo_id = Number(req.params.anexoId);
        if (!Number.isFinite(documento_id) || documento_id <= 0) {
            return res.status(400).json({
                error: "bad_request",
                message: "ID de documento inválido",
            });
        }
        if (!Number.isFinite(anexo_id) || anexo_id <= 0) {
            return res.status(400).json({
                error: "bad_request",
                message: "ID de anexo inválido",
            });
        }
        await consultaAprobadosService.assertCanAccess({
            user: req.user,
            actor: req.actor,
            documentoId: documento_id,
            req,
            accion: "DESCARGA",
        });
        const { filename, mime_type, buffer } = await documentoService.getAnexoFileParaConsulta({
            documento_id,
            anexo_id,
        });
        res.setHeader("Content-Type", mime_type || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).end(buffer);
    } catch (e) {
        let code = 500;
        if (e.code === "FORBIDDEN") code = 403;
        else if (e.code === "NOT_FOUND") code = 404;
        else if (e.code === "BAD_REQUEST") code = 400;
        res.status(code).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
}

router.get("/:id/anexos/:anexoId/download", authGuard, handleConsultaAnexoDescarga);
router.get("/:id/anexos/:anexoId/descargar", authGuard, handleConsultaAnexoDescarga);

export default router;

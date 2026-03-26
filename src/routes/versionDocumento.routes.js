//src/routes/versionDocumento.routes.js
import { Router } from "express";
import { versionDocumentoService } from "../services/versionDocumento.service.js";

const router = Router();

// Crear una nueva versión de documento (mantengo tu endpoint)
router.post("/versions", async (req, res) => {
    try {
        const { fecha, contenido, documentoId, documento_id, nombre_versionado } = req.body;
        const actor = req.user;

        const newVersion = await versionDocumentoService.create(
            { fecha, contenido, documento_id: documento_id ?? documentoId, nombre_versionado },
            actor
        );
        res.status(201).json(newVersion);
    } catch (error) {
        res.status(error?.code || 500).json({ error: error?.message || "Error al crear la versión del documento." });
    }
});

// Obtener todas las versiones de un documento (mantengo tu ruta)
router.get("/versions/:documentoId", async (req, res) => {
    try {
        const versions = await versionDocumentoService.list(req.params.documentoId);
        res.status(200).json(versions);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener las versiones del documento." });
    }
});

// ⚠️ La ruta /versions/:id se pisaba con /versions/:documentoId
// La muevo para no romper la lista que el frontend ya usa.
router.get("/versions/by-id/:id", async (req, res) => {
    try {
        const version = await versionDocumentoService.getVersionById(req.params.id);
        if (!version) return res.status(404).json({ error: "Versión no encontrada." });
        res.status(200).json(version);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener la versión del documento." });
    }
});

router.put("/versions/:id", async (req, res) => {
    try {
        const updatedVersion = await versionDocumentoService.update(req.params.id, req.body, req.user);
        res.status(200).json(updatedVersion);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar la versión del documento." });
    }
});

router.delete("/versions/:id", async (req, res) => {
    try {
        await versionDocumentoService.remove(req.params.id, req.user);
        res.status(200).json({ message: "Versión de documento eliminada correctamente." });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar la versión del documento." });
    }
});

// ✅ NUEVO: Restaurar versión
router.post("/documents/:documentoId/versions/:versionId/restore", async (req, res) => {
    try {
        const { documentoId, versionId } = req.params;
        const { motivo } = req.body;
        const actor = req.user;

        const result = await versionDocumentoService.restoreVersion(
            Number(documentoId),
            Number(versionId),
            motivo || "Restauración",
            actor
        );

        res.status(200).json(result);
    } catch (error) {
        res.status(error?.code || 500).json({ error: error?.message || "Error al restaurar versión." });
    }
});

export { router };

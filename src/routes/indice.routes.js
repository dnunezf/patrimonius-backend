//src/routes/indice.routes.js
import { Router } from 'express';
import { indiceService } from "../services/indice.service.js";
import { authGuard } from "../middleware/authGuard.js";
import { uploadSingle } from "../middleware/uploadFirma.js";

const router = Router();
router.use(authGuard);
function mapStatus(error) {
    if (error?.code === 400) return 400;
    if (error?.code === 404) return 404;
    if (error?.code === 409) return 409;
    if (error?.code === 422) return 422;
    return 500;
}

// Crear un nuevo índice electrónico
router.post("/generar", uploadSingle("file"), async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({
                error: "no_file",
                message: "No se recibió ningún archivo en el campo 'file'",
            });
        }

        const actor = req.actor ?? req.user ?? null;

        const result = await indiceService.generateFromSignedPdf({
            documentoId: req.body?.documentoId,
            usuarioId: req.body?.usuarioId,
            pdfBuffer: req.file.buffer,
            actor,
        });

        return res.status(result.duplicated ? 200 : 201).json(result);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error generando el índice electrónico",
            detail: error?.detail || null,
        });
    }
});

router.post("/", async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;
        const created = await indiceService.create(req.body, actor);
        return res.status(201).json(created);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al crear el índice electrónico",
        });
    }
});

router.get("/", async (_req, res) => {
    try {
        const rows = await indiceService.list();
        return res.status(200).json(rows);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al obtener los índices electrónicos",
        });
    }
});

router.get("/documento/:documentoId", async (req, res) => {
    try {
        const rows = await indiceService.listByDocumento(req.params.documentoId);
        return res.status(200).json(rows);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al obtener índices del documento",
        });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const row = await indiceService.getById(req.params.id);
        return res.status(200).json(row);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al obtener el índice electrónico",
        });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;
        const updated = await indiceService.update(req.params.id, req.body, actor);
        return res.status(200).json(updated);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al actualizar el índice electrónico",
        });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;
        await indiceService.remove(req.params.id, actor);
        return res.status(204).send();
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al eliminar el índice electrónico",
        });
    }
});

export { router };
export default router;
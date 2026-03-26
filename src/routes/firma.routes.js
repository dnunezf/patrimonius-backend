import { Router } from "express";
import { authGuard } from "../middleware/authGuard.js";
import { firmaService } from "../services/firma.service.js";
import { firmaValidationService } from "../services/firmaValidation.service.js";
import { uploadSingle } from "../middleware/uploadFirma.js";

const router = Router();

router.use(authGuard);

const mapStatus = (e) => {
    if (e?.code === 400) return 400;
    if (e?.code === 404) return 404;
    return 500;
};

// POST /firmas
router.post("/firmas", async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;
        const created = await firmaService.create(req.body, actor);
        return res.status(201).json(created);
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
        });
    }
});

// POST /validar
router.post("/validar", uploadSingle("file"), async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;
        const result = await firmaValidationService.validateUploadedDocument({
            file: req.file,
            body: req.body,
            actor,
        });

        return res.status(result.status).json(result.data);
    } catch (e) {
        return res.status(500).json({
            error: "internal_error",
            message: e?.message || "Error interno",
        });
    }
});

// GET /firmas/documento/:documentoId
router.get("/firmas/documento/:documentoId", async (req, res) => {
    try {
        const rows = await firmaService.listByDocumento(req.params.documentoId);
        return res.status(200).json(rows);
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
        });
    }
});

// GET /firmas/:id
router.get("/firmas/:id", async (req, res) => {
    try {
        const row = await firmaService.getById(req.params.id);
        return res.status(200).json(row);
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
        });
    }
});

// PATCH /firmas/:id
router.patch("/firmas/:id", async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;
        const updated = await firmaService.update(req.params.id, req.body, actor);
        return res.status(200).json(updated);
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
        });
    }
});

// DELETE /firmas/:id
router.delete("/firmas/:id", async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;
        await firmaService.remove(req.params.id, actor);
        return res.status(204).send();
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
        });
    }
});

export default router;
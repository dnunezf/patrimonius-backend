// BACKEND: src/routes/comentarios.routes.js
import { Router } from "express";
import { comentariosService } from "../services/comentarios.service.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();

// GET /documentos/:documentoId/comentarios
router.get("/documentos/:documentoId/comentarios", authGuard, async (req, res) => {
    try {
        const rows = await comentariosService.list(Number(req.params.documentoId));
        res.status(200).json(rows);
    } catch {
        res.status(500).json({ error: "Error al obtener comentarios." });
    }
});

// POST /documentos/:documentoId/comentarios
router.post("/documentos/:documentoId/comentarios", authGuard, async (req, res) => {
    try {
        const actor = req.user;
        const documentoId = Number(req.params.documentoId);
        const descripcion = String(req.body?.descripcion ?? "").trim();
        if (!descripcion) return res.status(400).json({ error: "descripcion_required" });

        const list = await comentariosService.create(
            { usuarioId: actor.id, documentoId, descripcion },
            actor
        );

        res.status(201).json(list); // ✅ lista actualizada
    } catch {
        res.status(500).json({ error: "Error al crear comentario." });
    }
});

// PATCH /comentarios/:id/resolver
router.patch("/comentarios/:id/resolver", authGuard, async (req, res) => {
    try {
        const actor = req.user;
        const list = await comentariosService.resolve(Number(req.params.id), actor);
        res.status(200).json(list ?? []); // ✅ lista actualizada
    } catch {
        res.status(500).json({ error: "Error al resolver comentario." });
    }
});

export default router;

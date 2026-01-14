// src/routes/notificacion.routes.js
import { Router } from "express";
import { notificacionService } from "../services/notificacion.service.js";
import { notificacionRepo } from "../repositories/notificacionRepo.js";

export const notificacionRouter = Router();

/**
 * GET /notificacion/mine?unreadOnly=1&limit=20&offset=0
 * Devuelve { items: [...] }
 */
notificacionRouter.get("/mine", async (req, res) => {
    try {
        const userId = Number(req.actor?.id || req.user?.id);
        if (!userId) return res.status(401).json({ error: "unauthorized" });

        const unreadOnly = String(req.query.unreadOnly || "0") === "1";
        const limit = req.query.limit != null ? Number(req.query.limit) : 50;
        const offset = req.query.offset != null ? Number(req.query.offset) : 0;

        const items = await notificacionService.listMine(userId, {
            unreadOnly,
            limit,
            offset,
        });

        return res.json({ items });
    } catch (err) {
        console.error("GET /notificacion/mine error:", err);
        return res.status(500).json({ error: "internal_error" });
    }
});

/**
 * GET /notificacion/mine/unread-count
 * Devuelve { unread: number }
 */
notificacionRouter.get("/mine/unread-count", async (req, res) => {
    try {
        const userId = Number(req.actor?.id || req.user?.id);
        if (!userId) return res.status(401).json({ error: "unauthorized" });

        const unread = await notificacionRepo.countUnreadByUser(userId);
        return res.json({ unread });
    } catch (err) {
        console.error("GET /notificacion/mine/unread-count error:", err);
        return res.status(500).json({ error: "internal_error" });
    }
});

/**
 * PATCH /notificacion/:id/read
 * Devuelve { ok: true }
 */
notificacionRouter.patch("/:id/read", async (req, res) => {
    try {
        const userId = Number(req.actor?.id || req.user?.id);
        if (!userId) return res.status(401).json({ error: "unauthorized" });

        const id = Number(req.params.id);
        await notificacionService.markRead(id, userId);

        return res.json({ ok: true });
    } catch (err) {
        console.error("PATCH /notificacion/:id/read error:", err);
        return res.status(500).json({ error: "internal_error" });
    }
});

/**
 * PATCH /notificacion/read-bulk  body: { ids: number[] }
 * Devuelve { ok: true, updated: number }
 */
notificacionRouter.patch("/read-bulk", async (req, res) => {
    try {
        const userId = Number(req.actor?.id || req.user?.id);
        if (!userId) return res.status(401).json({ error: "unauthorized" });

        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
        const updated = await notificacionRepo.markReadBulk(userId, ids);

        return res.json({ ok: true, updated });
    } catch (err) {
        console.error("PATCH /notificacion/read-bulk error:", err);
        return res.status(500).json({ error: "internal_error" });
    }
});

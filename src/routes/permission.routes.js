// src/routes/permission.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { accessExceptionService } from "../services/accessException.service.js";

const router = Router();
router.use(adminGuard);

router.post("/exceptions", async (req, res) => {
    try {
        const { userId, documentId, permissions, reason } = req.body;

        const data = await accessExceptionService.apply(
            {
                userId: Number(userId),
                documentId: Number(documentId),
                permissions,
                reason
            },
            req.actor || req.user,
            req
        );

        res.status(201).json(data);
    } catch (e) {
        res
            .status(e.code === 400 ? 400 : 500)
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

router.get("/exceptions", async (req, res) => {
    try {
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 10);

        const userIdRaw = req.query.userId;

        const categoriaIdRaw = req.query.categoriaId ?? req.query.categoryId;
        const estadoRaw = req.query.estado ?? req.query.status;
        const fromRaw = req.query.from ?? req.query.dateFrom;
        const toRaw = req.query.to ?? req.query.dateTo;

        const list = await accessExceptionService.list({
            page,
            pageSize,
            userId: userIdRaw ? Number(userIdRaw) : undefined,
            categoriaId: categoriaIdRaw ? Number(categoriaIdRaw) : undefined,
            estado: estadoRaw ? String(estadoRaw) : undefined,
            from: fromRaw ? String(fromRaw) : undefined,
            to: toRaw ? String(toRaw) : undefined
        });

        res.json(list);
    } catch (e) {
        // 👇 esto te deja ver el error real en consola
        console.error("GET /permissions/exceptions failed:", e);
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

router.delete("/exceptions", async (req, res) => {
    try {
        const { userId, documentId, reason } = req.body || {};

        await accessExceptionService.remove(
            {
                userId: Number(userId),
                documentId: Number(documentId),
                reason
            },
            req.actor || req.user,
            req
        );

        res.status(204).send();
    } catch (e) {
        res
            .status(e.code === 400 ? 400 : 500)
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

export default router;

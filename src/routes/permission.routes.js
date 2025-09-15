import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { accessExceptionService } from "../services/accessException.service.js";

const router = Router();
router.use(adminGuard);

/** Create or replace exception for user+document */
router.post("/exceptions", async (req, res) => {
    try {
        const { userId, documentId, permissions, reason } = req.body;
        const data = await accessExceptionService.apply(
            { userId: Number(userId), documentId: Number(documentId), permissions, reason },
            req.actor
        );
        res.status(201).json(data);
    } catch (e) {
        res.status(e.code === 400 ? 400 : 500).json({ error: e.code || "internal_error", message: e.message });
    }
});

/** List all active exceptions */
router.get("/exceptions", async (_req, res) => {
    try {
        const list = await accessExceptionService.list();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Remove exception for user+document */
router.delete("/exceptions", async (req, res) => {
    try {
        const { userId, documentId, reason } = req.body || {};
        await accessExceptionService.remove(
            { userId: Number(userId), documentId: Number(documentId), reason },
            req.actor
        );
        res.status(204).send();
    } catch (e) {
        res.status(e.code === 400 ? 400 : 500).json({ error: e.code || "internal_error", message: e.message });
    }
});

export default router;
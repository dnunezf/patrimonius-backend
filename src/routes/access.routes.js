// src/routes/access.routes.js
import { Router } from "express";

export default function accessRoutes({ confidentialityService }) {
  const router = Router();

  // POST /access/check { documentId, action }
  router.post("/check", async (req, res, next) => {
    try {
      const actorId = Number(req.actor?.id ?? req.user?.id ?? null);
      const actorRolIds = Array.isArray(req.user?.rolIds)
        ? req.user.rolIds.map(Number)
        : [];

      const { documentId, action } = req.body || {};
      const result = await confidentialityService.checkAccess({
        actorId: Number.isFinite(actorId) ? actorId : null,
        actorRolIds,
        documentId: Number(documentId),
        action: String(action || ""),
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

// src/routes/confidentiality.routes.js
import { Router } from "express";

/**
 * Minimal adminGuard:
 * - Accepts roleId === 1 (Administrador) OR isMaster === true
 */
function adminGuard(req, res, next) {
  const roleId = req.user?.rolId ?? req.user?.rol_id;
  const isMaster = req.user?.isMaster === true || req.actor?.isMaster === true;
  if (Number(roleId) === 1 || isMaster) return next();
  return res.status(403).json({ error: "forbidden" });
}

export function buildConfidentialityRoutes({ confidentialityService }) {
  const router = Router();

  // GET /admin/confidentiality/docs/:id
  router.get("/confidentiality/docs/:id", adminGuard, async (req, res) => {
    try {
      const cfg = await confidentialityService.getConfig(req.params.id);
      res.json(cfg);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.code || "internal_error" });
    }
  });

  // PUT /admin/confidentiality/docs/:id
  router.put("/confidentiality/docs/:id", adminGuard, async (req, res) => {
    try {
      const actorId = req.actor?.id ?? req.user?.id ?? 0;
      const cfg = await confidentialityService.setConfig({
        actorId,
        documentId: req.params.id,
        dto: req.body,
      });
      res.json(cfg);
    } catch (e) {
      res.status(e.status || 500).json({
        error: e.code || "internal_error",
        message: e.message || undefined,
      });
    }
  });

  return router;
}

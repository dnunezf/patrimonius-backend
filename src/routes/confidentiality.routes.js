// src/routes/confidentiality.routes.js
import { Router } from "express";

/**
 * Admin routes for HU-002
 * Mounted at: /admin
 * Requires: authGuard + adminGuard at app.js level.
 */
export function buildConfidentialityRoutes({ confidentialityService }) {
  const router = Router();

  // GET /admin/confidentiality/documents?search=
  router.get("/confidentiality/documents", async (req, res, next) => {
    try {
      const rows = await confidentialityService.listDocuments(
        req.query.search || "",
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // GET /admin/confidentiality/docs/:id
  router.get("/confidentiality/docs/:id", async (req, res, next) => {
    try {
      const cfg = await confidentialityService.getConfig(req.params.id);
      res.json(cfg);
    } catch (e) {
      next(e);
    }
  });

  // PUT /admin/confidentiality/docs/:id
  router.put("/confidentiality/docs/:id", async (req, res, next) => {
    try {
      const saved = await confidentialityService.setConfig(
        req.params.id,
        req.body,
      );
      res.json(saved);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

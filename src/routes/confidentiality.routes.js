// src/routes/confidentiality.routes.js
import express from "express";
import {
  SetConfidentialitySchema,
  ActionSchema,
} from "../validators/confidentiality.schema.js";

/**
 * Routes for HU-002
 * - GET  /admin/confidentiality/documents
 * - GET  /admin/confidentiality/docs/:id
 * - PUT  /admin/confidentiality/docs/:id
 * - POST /access/check
 */
export function buildConfidentialityRoutes({
  authGuard,
  adminGuard,
  confidentialityService,
}) {
  const r = express.Router();

  r.get(
    "/admin/confidentiality/documents",
    authGuard,
    adminGuard,
    async (req, res, next) => {
      try {
        const search = String(req.query.search ?? "");
        const rows = await confidentialityService.listDocuments(search);
        res.json(rows);
      } catch (e) {
        next(e);
      }
    }
  );

  r.get(
    "/admin/confidentiality/docs/:id",
    authGuard,
    adminGuard,
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
          return res.status(400).json({ message: "Invalid document id." });
        }

        const cfg = await confidentialityService.getConfig(id);
        if (!cfg)
          return res.status(404).json({ message: "Document not found." });

        res.json(cfg);
      } catch (e) {
        next(e);
      }
    }
  );

  r.put(
    "/admin/confidentiality/docs/:id",
    authGuard,
    adminGuard,
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
          return res.status(400).json({ message: "Invalid document id." });
        }

        const parsed = SetConfidentialitySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: "Validation error.",
            errors: parsed.error.flatten(),
          });
        }

        const saved = await confidentialityService.setConfig(
          req.actor,
          id,
          parsed.data
        );
        res.json(saved);
      } catch (e) {
        next(e);
      }
    }
  );

  /**
   * POST /access/check
   * Body: { documentId:number, action:'VIEW'|'EDIT'|'SIGN' }
   * Requires authGuard (actor + rolIds)
   */
  r.post("/access/check", authGuard, async (req, res, next) => {
    try {
      const documentId = Number(req.body?.documentId);
      const action = req.body?.action;

      if (!Number.isFinite(documentId) || documentId <= 0) {
        return res.status(400).json({ message: "Invalid documentId." });
      }
      const a = ActionSchema.safeParse(action);
      if (!a.success)
        return res.status(400).json({ message: "Invalid action." });

      const roleIds = Array.isArray(req.actor?.rolIds)
        ? req.actor.rolIds.map(Number).filter((n) => Number.isFinite(n))
        : [];

      const ip =
        req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
        req.socket?.remoteAddress ??
        null;

      const userAgent = req.headers["user-agent"]?.toString() ?? null;

      const result = await confidentialityService.checkAccess({
        actor: req.actor,
        documentId,
        action: a.data,
        roleIds,
        ip,
        userAgent,
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  return r;
}

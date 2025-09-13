// src/routes/adminConfidentiality.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { accessService } from "../services/accessService.js";
import { setConfidentialitySchema, validate } from "../utils/validator.js";

export const adminConfidentiality = Router();
adminConfidentiality.use(adminGuard);

/** Read current confidentiality config for a document. */
adminConfidentiality.get("/confidentiality/docs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "invalid_id" });
    }
    const cfg = await accessService.getDocumentConfig(id);
    if (!cfg) return res.status(404).json({ error: "not_found" });
    res.json(cfg);
  } catch (e) {
    res
      .status(e.code || 500)
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

/** Replace level and allow-lists for a document (atomic). */
adminConfidentiality.put("/confidentiality/docs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "invalid_id" });
    }

    // Strict input validation for HU-002 payload
    const dto = validate(setConfidentialitySchema, {
      level: req.body?.level,
      users: req.body?.users,
      roles: req.body?.roles,
    });

    const cfg = await accessService.setDocumentConfig(id, dto, req.actor);
    res.json(cfg);
  } catch (e) {
    res
      .status(e.code || 500)
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

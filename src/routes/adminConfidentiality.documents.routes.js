// src/routes/adminConfidentiality.docs.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { pool } from "../db/pool.js";
import { accessService } from "../services/accessService.js";

export const adminConfidentialityDocs = Router();
adminConfidentialityDocs.use(adminGuard);

/**
 * GET /admin/confidentiality/documents?search=
 * Returns minimal list for the document selector.
 */
adminConfidentialityDocs.get("/confidentiality/documents", async (req, res) => {
  try {
    const q = String(req.query.search || "").trim();
    const like = `%${q}%`;

    const [rows] = await pool.query(
      `
      SELECT
        d.id AS id,
        d.titulo AS title,
        d.numero_serie AS code,
        d.estado AS status,
        d.confid_level AS level,
        u.nombre AS unit,
        u.id AS unitId
      FROM Documento d
      JOIN Unidad_Organizacional u ON u.id = d.unidad_id
      WHERE
        (:q = '' OR d.titulo LIKE :like OR d.numero_serie LIKE :like OR CAST(d.id AS CHAR) LIKE :like)
      ORDER BY d.id DESC
      LIMIT 100
      `,
      { q, like }
    );

    res.json(rows || []);
  } catch (e) {
    console.error("[adminConfidentialityDocs] list documents failed:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /admin/confidentiality/docs/:id
 * Returns current confidentiality config (level + explicit allow-lists).
 */
adminConfidentialityDocs.get("/confidentiality/docs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cfg = await accessService.getDocumentConfig(id);
    if (!cfg) return res.status(404).json({ error: "not_found" });
    res.json(cfg);
  } catch (e) {
    console.error("[adminConfidentialityDocs] get config failed:", e);
    res
      .status(e.code || 500)
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

/**
 * PUT /admin/confidentiality/docs/:id
 * Body: { level, users:[{userId,actions[]}], roles:[{roleId,actions[]}] }
 *
 * IMPORTANT:
 * Always returns JSON (the saved config), to avoid frontend "saved but shows error"
 * caused by empty responses / JSON parse issues.
 */
adminConfidentialityDocs.put("/confidentiality/docs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};

    const saved = await accessService.setDocumentConfig(
      id,
      {
        level: body.level,
        users: Array.isArray(body.users) ? body.users : [],
        roles: Array.isArray(body.roles) ? body.roles : [],
      },
      req.actor
    );

    res.json(saved);
  } catch (e) {
    console.error("[adminConfidentialityDocs] set config failed:", e);
    res
      .status(e.code || 500)
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

export default adminConfidentialityDocs;

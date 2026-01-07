// src/routes/adminConfidentiality.documents.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { pool } from "../db/pool.js";

export const adminConfidentialityDocs = Router();
adminConfidentialityDocs.use(adminGuard);

/**
 * GET /admin/confidentiality/documents?search=
 * Returns minimal list for selector.
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
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

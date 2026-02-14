// src/repositories/firmaExternalVerificationRepo.js
import { pool } from "../db/pool.js";

/**
 * Tabla: Firma_Externa_Verificacion
 * Guarda historial de verificaciones de firma externa.
 */
export const firmaExternalVerificationRepo = {
    async create(row) {
        const sql = `
      INSERT INTO Firma_Externa_Verificacion
      (documento_id, verificado_por_usuario_id, estado,
       certificado_serial, certificado_issuer, certificado_subject,
       certificado_not_before, certificado_not_after,
       detalle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const params = [
            row.documento_id,
            row.verificado_por_usuario_id,
            row.estado,
            row.certificado_serial ?? null,
            row.certificado_issuer ?? null,
            row.certificado_subject ?? null,
            row.certificado_not_before ?? null,
            row.certificado_not_after ?? null,
            row.detalle ? JSON.stringify(row.detalle) : null,
        ];

        const [r] = await pool.query(sql, params);
        return { id: r.insertId, ...row };
    },

    async latestByDocumentoId(documentoId) {
        const sql = `
      SELECT *
      FROM Firma_Externa_Verificacion
      WHERE documento_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
        const [rows] = await pool.query(sql, [documentoId]);
        return rows?.[0] ?? null;
    },

    async listByDocumentoId(documentoId, { limit = 50, offset = 0 } = {}) {
        const sql = `
      SELECT *
      FROM Firma_Externa_Verificacion
      WHERE documento_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;
        const [rows] = await pool.query(sql, [
            documentoId,
            Number(limit),
            Number(offset),
        ]);
        return rows ?? [];
    },
};

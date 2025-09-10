// src/repositories/documentoPlantillaRepo.js
import { pool } from "../db/pool.js";

export const documentoPlantillaRepo = {
    async link(documentoId, plantillaId) {
        const query = `
      INSERT IGNORE INTO Documento_Plantilla (documento_id, plantilla_id)
      VALUES (?, ?)
    `;
        await pool.query(query, [documentoId, plantillaId]);
    },

    async unlink(documentoId, plantillaId) {
        const query = `
      DELETE FROM Documento_Plantilla
      WHERE documento_id = ? AND plantilla_id = ?
    `;
        await pool.query(query, [documentoId, plantillaId]);
    },

    async findPlantillasByDocumento(documentoId) {
        const query = `
      SELECT p.*
      FROM Documento_Plantilla dp
      JOIN Plantilla p ON p.id = dp.plantilla_id
      WHERE dp.documento_id = ?
    `;
        const [rows] = await pool.query(query, [documentoId]);
        return rows;
    }
};
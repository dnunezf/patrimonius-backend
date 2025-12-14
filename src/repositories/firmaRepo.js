//src/repositories/firmaRepo.js
import { pool } from "../db/pool.js";

/** Firma repository. SQL-only. */
export const firmaRepo = {
    // Crear una nueva firma
    async createFirma(firmaData) {
        const { documento_id, usuario_id, fecha } = firmaData;
        const query = `
      INSERT INTO Firma_Digital (documento_id, usuario_id, fecha)
      VALUES (?, ?, ?)
    `;
        const values = [documento_id, usuario_id, fecha];

        const [result] = await pool.query(query, values);
        return { id: result.insertId, ...firmaData }; // Devolver el objeto creado con el ID asignado
    },

    // Obtener todas las firmas de un documento
    async getAllFirmas(documentoId) {
        const query = `
      SELECT id, documento_id, usuario_id, fecha
      FROM Firma_Digital
      WHERE documento_id = ?
    `;
        const [rows] = await pool.query(query, [documentoId]);
        return rows;
    },

    // Obtener una firma por ID
    async getFirmaById(id) {
        const query = `
      SELECT id, documento_id, usuario_id, fecha
      FROM Firma_Digital
      WHERE id = ?
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] || null;
    },

    // Eliminar una firma por ID
    async removeFirma(id) {
        const query = `DELETE FROM Firma_Digital WHERE id = ?`;
        await pool.query(query, [id]);
    },

    // Actualizar una firma
    async updateFirma(id, updateData) {
        const { documento_id, usuario_id, fecha } = updateData;
        const query = `
      UPDATE Firma_Digital
      SET documento_id = ?, usuario_id = ?, fecha = ?
      WHERE id = ?
    `;
        const values = [documento_id, usuario_id, fecha, id];

        const [result] = await pool.query(query, values);
        return result.affectedRows > 0 ? { id, ...updateData } : null; // Devuelve la firma actualizada
    },
};
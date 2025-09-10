import { pool } from "../db/pool.js";

/** Metadato repository. SQL-only. */
export const metadatoRepo = {
    // Crear un nuevo metadato
    async createMetadato(metadatoData) {
        const { tipo, documento_id, valor } = metadatoData;
        const query = `
      INSERT INTO Metadato (tipo, documento_id, valor)
      VALUES (?, ?, ?)
    `;
        const values = [tipo, documento_id, valor];

        const [result] = await pool.query(query, values);
        return { id: result.insertId, ...metadatoData }; // Devolver el objeto creado con el ID asignado
    },

    // Obtener todos los metadatos de un documento
    async getAllMetadatos(documentoId) {
        const query = `
      SELECT id, tipo, valor
      FROM Metadato
      WHERE documento_id = ?
    `;
        const [rows] = await pool.query(query, [documentoId]);
        return rows;
    },

    // Obtener un metadato por ID
    async getMetadatoById(id) {
        const query = `
      SELECT id, tipo, valor
      FROM Metadato
      WHERE id = ?
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] || null;
    },

    // Eliminar un metadato por ID
    async removeMetadato(id) {
        const query = `DELETE FROM Metadato WHERE id = ?`;
        await pool.query(query, [id]);
    },

    // Actualizar un metadato
    async updateMetadato(id, updateData) {
        const { tipo, valor } = updateData;
        const query = `
      UPDATE Metadato
      SET tipo = ?, valor = ?
      WHERE id = ?
    `;
        const values = [tipo, valor, id];

        const [result] = await pool.query(query, values);
        return result.affectedRows > 0 ? { id, ...updateData } : null; // Devuelve el metadato actualizado
    },
};
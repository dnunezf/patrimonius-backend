// src/repositories/metadatoRepo.js
import { pool } from "../db/pool.js";

/** Metadata repository. SQL-only. */
export const metadatoRepo = {
  // Create a new metadata row
  async createMetadato(metadatoData) {
    const { tipo, documento_id, valor } = metadatoData;
    const [result] = await pool.query(
      `INSERT INTO Metadato (tipo, documento_id, valor) VALUES (?, ?, ?)`,
      [tipo, documento_id, valor]
    );
    return { id: result.insertId, ...metadatoData };
  },

  // Upsert by unique (documento_id, tipo)
  async upsertByTipo({ documento_id, tipo, valor }) {
    await pool.query(
      `INSERT INTO Metadato (tipo, documento_id, valor)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [tipo, documento_id, valor]
    );
  },

  // Bulk upsert from a plain object map: { TIPO: value, ... }
  async upsertMap(documento_id, map) {
    const entries = Object.entries(map);
    if (!entries.length) return;
    const values = [];
    const placeholders = entries
      .map(([tipo, valor]) => {
        values.push(tipo, documento_id, valor);
        return "(?, ?, ?)";
      })
      .join(", ");

    await pool.query(
      `INSERT INTO Metadato (tipo, documento_id, valor)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      values
    );
  },

  async getAllMetadatos(documentoId) {
    const [rows] = await pool.query(
      `SELECT id, tipo, valor FROM Metadato WHERE documento_id = ?`,
      [documentoId]
    );
    return rows;
  },

  // Simple map { tipo: valor }
  async getMap(documentoId) {
    const rows = await this.getAllMetadatos(documentoId);
    const map = {};
    for (const r of rows) map[r.tipo] = r.valor;
    return map;
  },

  async getMetadatoById(id) {
    const [rows] = await pool.query(
      `SELECT id, tipo, valor FROM Metadato WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async removeMetadato(id) {
    await pool.query(`DELETE FROM Metadato WHERE id = ?`, [id]);
  },

  async updateMetadato(id, updateData) {
    const { tipo, valor } = updateData;
    const [result] = await pool.query(
      `UPDATE Metadato SET tipo = ?, valor = ? WHERE id = ?`,
      [tipo, valor, id]
    );
    return result.affectedRows > 0 ? { id, ...updateData } : null;
  },
};

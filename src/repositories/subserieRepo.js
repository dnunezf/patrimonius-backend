// src/repositories/subserieRepo.js
import { pool } from "../db/pool.js";

export const subserieRepo = {
  async createSubserie({ codigo, nombre, serie_id, descripcion }) {
    const [result] = await pool.execute(
      `INSERT INTO Subserie (codigo, nombre, serie_id, descripcion, activa)
             VALUES (?, ?, ?, ?, 1)`,
      [codigo, nombre, serie_id, descripcion ?? null],
    );

    return {
      id: result.insertId,
      codigo,
      nombre,
      serie_id,
      descripcion,
      activa: 1,
    };
  },

  async getAllSubseries() {
    const [rows] = await pool.query(`
            SELECT ss.*, s.nombre AS serie_nombre
            FROM Subserie ss
            JOIN Serie s ON ss.serie_id = s.id
            WHERE ss.activa = 1
              AND s.activa = 1
            ORDER BY ss.nombre ASC, ss.id ASC
        `);

    return rows;
  },

  async getSubserieById(subserieId) {
    const [rows] = await pool.query("SELECT * FROM Subserie WHERE id = ?", [
      subserieId,
    ]);

    return rows[0] || null;
  },

  async getSubseriesByUnidadId(unidadId) {
    const [rows] = await pool.query(
      `
            SELECT
                ss.*,
                s.nombre AS serie_nombre,
                s.unidad_id
            FROM Subserie ss
            JOIN Serie s ON ss.serie_id = s.id
            WHERE s.unidad_id = ?
              AND ss.activa = 1
              AND s.activa = 1
            ORDER BY ss.nombre ASC, ss.id ASC
            `,
      [unidadId],
    );

    return rows;
  },

  async updateSubserie(id, { codigo, nombre, serie_id, descripcion }) {
    await pool.execute(
      `UPDATE Subserie
             SET codigo = ?,
                 nombre = ?,
                 serie_id = ?,
                 descripcion = ?
             WHERE id = ?`,
      [codigo, nombre, serie_id, descripcion ?? null, id],
    );

    return this.getSubserieById(id);
  },

  async countExpedientesBySubserieId(id) {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS total FROM Expediente WHERE subserie_id = ?",
      [id],
    );

    return rows[0].total;
  },

  async deleteSubserie(id) {
    await pool.execute("DELETE FROM Subserie WHERE id = ?", [id]);
  },
};

// src/repositories/subserieRepo.js
import { pool } from "../db/pool.js";

export const subserieRepo = {
    async createSubserie({ codigo, nombre, serie_id, descripcion }) {
        const [result] = await pool.execute(
            "INSERT INTO Subserie (codigo, nombre, serie_id, descripcion) VALUES (?, ?, ?, ?)",
            [codigo, nombre, serie_id, descripcion]
        );
        return { id: result.insertId, codigo, nombre, serie_id, descripcion };
    },

    async getAllSubseries() {
        const [rows] = await pool.query(`
            SELECT ss.*, s.nombre AS serie_nombre
            FROM Subserie ss
                     JOIN Serie s ON ss.serie_id = s.id
            ORDER BY ss.id ASC
        `);
        return rows;
    },

    async getSubserieById(subserieId) {
        const [rows] = await pool.query("SELECT * FROM Subserie WHERE id = ?", [subserieId]);
        return rows[0] || null;
    },

    async updateSubserie(id, { codigo, nombre, serie_id, descripcion }) {
        await pool.execute(
            "UPDATE Subserie SET codigo = ?, nombre = ?, serie_id = ?, descripcion = ? WHERE id = ?",
            [codigo, nombre, serie_id, descripcion, id]
        );
        return this.getSubserieById(id);
    },

    async countExpedientesBySubserieId(id) {
        const [rows] = await pool.query(
            "SELECT COUNT(*) AS total FROM Expediente WHERE subserie_id = ?",
            [id]
        );
        return rows[0].total;
    },

    async deleteSubserie(id) {
        await pool.execute("DELETE FROM Subserie WHERE id = ?", [id]);
    },
};
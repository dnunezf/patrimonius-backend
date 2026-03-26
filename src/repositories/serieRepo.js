// src/repositories/serieRepo.js
import { pool } from "../db/pool.js";

export const serieRepo = {
    async createSerie({ codigo, nombre, unidad_id, descripcion }) {
        const [result] = await pool.execute(
            "INSERT INTO Serie (codigo, nombre, unidad_id, descripcion) VALUES (?, ?, ?, ?)",
            [codigo, nombre, unidad_id, descripcion]
        );
        return { id: result.insertId, codigo, nombre, unidad_id, descripcion };
    },

    async getAllSeries() {
        const [rows] = await pool.query(`
            SELECT s.*, u.nombre AS unidad_nombre
            FROM Serie s
                     JOIN Unidad_Organizacional u ON s.unidad_id = u.id
            ORDER BY s.id ASC
        `);
        return rows;
    },

    async getSerieById(serieId) {
        const [rows] = await pool.query("SELECT * FROM Serie WHERE id = ?", [serieId]);
        return rows[0] || null;
    },

    async updateSerie(id, { codigo, nombre, unidad_id, descripcion }) {
        await pool.execute(
            "UPDATE Serie SET codigo = ?, nombre = ?, unidad_id = ?, descripcion = ? WHERE id = ?",
            [codigo, nombre, unidad_id, descripcion, id]
        );
        return this.getSerieById(id);
    },

    async countSubseriesBySerieId(id) {
        const [rows] = await pool.query(
            "SELECT COUNT(*) AS total FROM Subserie WHERE serie_id = ?",
            [id]
        );
        return rows[0].total;
    },

    async countExpedientesBySerieId(id) {
        const [rows] = await pool.query(
            "SELECT COUNT(*) AS total FROM Expediente WHERE serie_id = ?",
            [id]
        );
        return rows[0].total;
    },

    async deleteSerie(id) {
        await pool.execute("DELETE FROM Serie WHERE id = ?", [id]);
    },
};
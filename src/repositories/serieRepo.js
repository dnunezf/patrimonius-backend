// src/repositories/serieRepo.js
import { pool } from "../db/pool.js";

export const serieRepo = {
    async createSerie({ codigo, nombre, unidad_id, descripcion, plazo_conservacion_anios = 5 }) {
        const plazo = Number(plazo_conservacion_anios);
        const plazoOk = Number.isInteger(plazo) && plazo > 0 ? plazo : 5;
        const [result] = await pool.execute(
            `INSERT INTO Serie (codigo, nombre, unidad_id, descripcion, plazo_conservacion_anios, activa)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [codigo, nombre, unidad_id, descripcion ?? null, plazoOk]
        );
        return {
            id: result.insertId,
            codigo,
            nombre,
            unidad_id,
            descripcion,
            plazo_conservacion_anios: plazoOk,
        };
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

    async getSeriesByUnidadId(unidadId) {
        const [rows] = await pool.query(`
        SELECT s.*, u.nombre AS unidad_nombre
        FROM Serie s
        JOIN Unidad_Organizacional u ON s.unidad_id = u.id
        WHERE s.unidad_id = ?
        ORDER BY s.id ASC
    `, [unidadId]);

        return rows;
    },

    async getSerieById(serieId) {
        const [rows] = await pool.query("SELECT * FROM Serie WHERE id = ?", [serieId]);
        return rows[0] || null;
    },

    async updateSerie(id, { codigo, nombre, unidad_id, descripcion, plazo_conservacion_anios }) {
        const existing = await this.getSerieById(id);
        if (!existing) {
            return null;
        }
        let plazoVal = existing.plazo_conservacion_anios;
        if (plazo_conservacion_anios !== undefined && plazo_conservacion_anios !== null) {
            const p = Number(plazo_conservacion_anios);
            if (Number.isInteger(p) && p > 0) {
                plazoVal = p;
            }
        }
        await pool.execute(
            `UPDATE Serie
             SET codigo = ?, nombre = ?, unidad_id = ?, descripcion = ?, plazo_conservacion_anios = ?
             WHERE id = ?`,
            [codigo, nombre, unidad_id, descripcion ?? null, plazoVal, id]
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
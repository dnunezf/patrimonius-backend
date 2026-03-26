// src/repositories/serieRepo.js
import { pool } from "../db/pool.js";  // Pool de conexión a la base de datos

export const serieRepo = {
    // Crear una nueva serie
    async createSerie({ codigo, nombre, unidad_id, descripcion }) {
        const [result] = await pool.execute(
            "INSERT INTO Serie (codigo, nombre, unidad_id, descripcion) VALUES (?, ?, ?, ?)",
            [codigo, nombre, unidad_id, descripcion]
        );
        return { id: result.insertId, codigo, nombre, unidad_id, descripcion };
    },

    // Obtener todas las series
    async getAllSeries() {
        const [rows] = await pool.query(
            `SELECT s.*, u.nombre AS unidad_nombre
             FROM Serie s
                      JOIN Unidad_Organizacional u ON s.unidad_id = u.id`
        );
        return rows;
    },

    // Obtener serie por ID
    async getSerieById(serieId) {
        const [rows] = await pool.query("SELECT * FROM Serie WHERE id = ?", [serieId]);
        return rows[0] || null;
    },

    // Actualizar una serie
    async updateSerie(id, { codigo, nombre, unidad_id, descripcion }) {
        await pool.execute(
            "UPDATE Serie SET codigo = ?, nombre = ?, unidad_id = ?, descripcion = ? WHERE id = ?",
            [codigo, nombre, unidad_id, descripcion, id]
        );
        return this.getSerieById(id);  // Devuelve la serie actualizada
    },

    // Eliminar una serie
    async deleteSerie(id) {
        await pool.execute("DELETE FROM Serie WHERE id = ?", [id]);
    },
};
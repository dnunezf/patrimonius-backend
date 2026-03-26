// src/repositories/subserieRepo.js
import { pool } from "../db/pool.js";  // Pool de conexión a la base de datos

export const subserieRepo = {
    // Crear una nueva subserie
    async createSubserie({ codigo, nombre, serie_id, descripcion }) {
        const [result] = await pool.execute(
            "INSERT INTO Subserie (codigo, nombre, serie_id, descripcion) VALUES (?, ?, ?, ?)",
            [codigo, nombre, serie_id, descripcion]
        );
        return { id: result.insertId, codigo, nombre, serie_id, descripcion };
    },

    // Obtener todas las subseries
    async getAllSubseries() {
        const [rows] = await pool.query("SELECT * FROM Subserie");
        return rows;
    },

    // Obtener subserie por ID
    async getSubserieById(subserieId) {
        const [rows] = await pool.query("SELECT * FROM Subserie WHERE id = ?", [subserieId]);
        return rows[0] || null;
    },

    // Actualizar una subserie
    async updateSubserie(id, { codigo, nombre, serie_id, descripcion }) {
        await pool.execute(
            "UPDATE Subserie SET codigo = ?, nombre = ?, serie_id = ?, descripcion = ? WHERE id = ?",
            [codigo, nombre, serie_id, descripcion, id]
        );
        return this.getSubserieById(id);  // Devuelve la subserie actualizada
    },

    // Eliminar una subserie
    async deleteSubserie(id) {
        await pool.execute("DELETE FROM Subserie WHERE id = ?", [id]);
    },
};
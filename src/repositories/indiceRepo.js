//src/repositories/indiceRepo.js
import { pool } from "../db/pool.js";

/** Índice Electrónico Repository. SQL-only. */
export const indiceRepo = {
    // Crear un nuevo índice electrónico
    async createIndex(indiceData) {
        const [result] = await pool.execute(
            `INSERT INTO Indice_Electronico (hash, fecha, firma_id)
             VALUES (:hash, :fecha, :firmaId)`,
            indiceData
        );
        return { id: result.insertId, ...indiceData };
    },

    // Obtener todos los índices electrónicos
    async getAllIndices() {
        const [rows] = await pool.query(
            `SELECT id, hash, fecha, firma_id
             FROM Indice_Electronico
             ORDER BY id DESC`
        );
        return rows;
    },

    // Obtener un índice electrónico por ID
    async getIndexById(id) {
        const [rows] = await pool.query(
            `SELECT id, hash, fecha, firma_id
             FROM Indice_Electronico
             WHERE id = :id`,
            { id }
        );
        return rows[0] || null;
    },

    // Actualizar un índice electrónico
    async updateIndex(id, updateData) {
        const fields = [];
        const params = { id };
        for (const [key, value] of Object.entries(updateData)) {
            fields.push(`${key} = :${key}`);
            params[key] = value;
        }
        if (!fields.length) return this.getIndexById(id);
        await pool.execute(
            `UPDATE Indice_Electronico SET ${fields.join(", ")} WHERE id = :id`,
            params
        );
        return this.getIndexById(id);
    },

    // Eliminar un índice electrónico
    async removeIndex(id) {
        await pool.execute(`DELETE FROM Indice_Electronico WHERE id = :id`, { id });
    },
};
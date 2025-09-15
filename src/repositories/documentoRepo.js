// src/repositories/documentoRepo.js
import { pool } from "../db/pool.js";

export const documentoRepo = {
    async create(dto) {
        const {
            numero_serie,
            titulo,
            contenido,
            estado,
            fecha,
            unidad_id,
            usuario_id,
            categoria_id,
        } = dto;

        const query = `
            INSERT INTO Documento (numero_serie, titulo, contenido, estado, fecha, unidad_id, usuario_id, categoria_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.query(query, [
            numero_serie,
            titulo,
            contenido,
            estado,
            fecha,
            unidad_id,
            usuario_id,
            categoria_id ?? null,
        ]);

        return { id: result.insertId, ...dto };
    },

    async findAll() {
        const query = `
      SELECT d.*, u.nombre AS nombre_usuario, c.nombre AS nombre_categoria, un.nombre AS nombre_unidad
      FROM Documento d
      JOIN Usuario u ON u.id = d.usuario_id
      JOIN Unidad_Organizacional un ON un.id = d.unidad_id
      LEFT JOIN Categoria c ON c.id = d.categoria_id
      ORDER BY d.fecha DESC
    `;
        const [rows] = await pool.query(query);
        return rows;
    },

    async findById(id) {
        const query = `SELECT * FROM Documento WHERE id = ?`;
        const [rows] = await pool.query(query, [id]);
        return rows[0] ?? null;
    },

    async update(id, patch) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(patch)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }

        if (!fields.length) return this.findById(id);

        const query = `UPDATE Documento SET ${fields.join(", ")} WHERE id = ?`;
        values.push(id);

        await pool.query(query, values);
        return this.findById(id);
    },

    async remove(id) {
        await pool.query(`DELETE FROM Documento WHERE id = ?`, [id]);
    }
};
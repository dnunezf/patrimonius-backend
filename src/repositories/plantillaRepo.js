// src/repositories/plantillaRepo.js
import { pool } from "../db/pool.js";

export const plantillaRepo = {
    // Crear una nueva plantilla
    async create(dto) {
        const { nombre, descripcion, version, ruta_archivo } = dto;
        const query = `
            INSERT INTO Plantilla (nombre, descripcion, version, ruta_archivo)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await pool.query(query, [nombre, descripcion, version, ruta_archivo]);
        return { id: result.insertId, ...dto };  // Retorna la plantilla con el ID asignado
    },

    // Obtener todas las plantillas
    async findAll() {
        const [rows] = await pool.query(`SELECT * FROM Plantilla`);
        return rows;
    },

    // Buscar plantilla por ID
    async findById(id) {
        const [rows] = await pool.query(`SELECT * FROM Plantilla WHERE id = ?`, [id]);
        return rows[0] ?? null;
    },

    // Actualizar plantilla
    async update(id, dto) {
        const { nombre, descripcion, version, ruta_archivo } = dto;
        const query = `
            UPDATE Plantilla
            SET nombre = ?, descripcion = ?, version = ?, ruta_archivo = ?
            WHERE id = ?
        `;
        const [result] = await pool.query(query, [nombre, descripcion, version, ruta_archivo, id]);
        return result.affectedRows > 0 ? { id, ...dto } : null;  // Si se actualizó, retornamos el objeto actualizado
    },

    // Eliminar plantilla
    async remove(id) {
        await pool.query(`DELETE FROM Plantilla WHERE id = ?`, [id]);
    }
};
// src/repositories/PlantillaRepo.js
import { pool } from "../db/pool.js";

export const plantillaRepo = {
    async create(dto) {
        const { nombre, descripcion, version, ruta_archivo } = dto;
        const query = `
      INSERT INTO Plantilla (nombre, descripcion, version, ruta_archivo)
      VALUES (?, ?, ?, ?)
    `;
        const [result] = await pool.query(query, [nombre, descripcion, version, ruta_archivo]);
        return { id: result.insertId, ...dto };
    },

    async findAll() {
        const [rows] = await pool.query(`SELECT * FROM Plantilla`);
        return rows;
    },

    async findById(id) {
        const [rows] = await pool.query(`SELECT * FROM Plantilla WHERE id = ?`, [id]);
        return rows[0] ?? null;
    },

    async update(id, dto) {
        const { nombre, descripcion, version, ruta_archivo } = dto;
        const query = `
      UPDATE Plantilla
      SET nombre = ?, descripcion = ?, version = ?, ruta_archivo = ?
      WHERE id = ?
    `;
        const [result] = await pool.query(query, [nombre, descripcion, version, ruta_archivo, id]);
        return result.affectedRows > 0 ? { id, ...dto } : null;
    },

    async remove(id) {
        await pool.query(`DELETE FROM Plantilla WHERE id = ?`, [id]);
    },

    // Buscar por par único (nombre, versión)
    async findByNameVersion(nombre, version) {
        const [rows] = await pool.query(
            `SELECT * FROM Plantilla WHERE nombre = ? AND version = ? LIMIT 1`,
            [nombre, version]
        );
        return rows[0] ?? null;
    },

// Existe por id
    async existsById(id) {
        const [rows] = await pool.query(`SELECT 1 FROM Plantilla WHERE id = ? LIMIT 1`, [id]);
        return !!rows.length;
    },

// Borrado seguro: evita violar FKs si hay vínculos
    async safeRemove(id) {
        // ¿Está vinculada a algún documento?
        const [vinc] = await pool.query(
            `SELECT 1 FROM Documento_Plantilla WHERE plantilla_id = ? LIMIT 1`,
            [id]
        );
        // ¿Tiene imágenes asociadas?
        const [imgs] = await pool.query(
            `SELECT 1 FROM Plantilla_Imagen WHERE plantilla_id = ? LIMIT 1`,
            [id]
        );

        if (vinc.length || imgs.length) {
            // Opciones: lanzar error claro o retornar estado
            return { deleted: false, reason: 'Plantilla vinculada a documentos o imágenes' };
        }
        await pool.query(`DELETE FROM Plantilla WHERE id = ?`, [id]);
        return { deleted: true };
    },

};
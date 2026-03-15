// src/repositories/documentoAnexoRepo.js
import { pool } from "../db/pool.js";

export const documentoAnexoRepo = {
    async create({
                     documento_id,
                     usuario_id,
                     nombre_original,
                     nombre_guardado,
                     ruta_archivo,
                     mime_type,
                     tamano_bytes,
                     descripcion = null,
                     orden_visual = 1,
                 }) {
        const [result] = await pool.query(
            `INSERT INTO Documento_Anexo
             (documento_id, usuario_id, nombre_original, nombre_guardado, ruta_archivo, mime_type, tamano_bytes, descripcion, orden_visual)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                documento_id,
                usuario_id,
                nombre_original,
                nombre_guardado,
                ruta_archivo,
                mime_type,
                tamano_bytes,
                descripcion,
                orden_visual,
            ]
        );

        return await this.findById(result.insertId);
    },

    async findById(id) {
        const [rows] = await pool.query(
            `SELECT *
             FROM Documento_Anexo
             WHERE id = ?
             LIMIT 1`,
            [id]
        );

        return rows[0] ?? null;
    },

    async listByDocumento(documento_id) {
        const [rows] = await pool.query(
            `SELECT
                 a.id,
                 a.documento_id,
                 a.usuario_id,
                 a.nombre_original,
                 a.nombre_guardado,
                 a.ruta_archivo,
                 a.mime_type,
                 a.tamano_bytes,
                 a.descripcion,
                 a.fecha_subida,
                 a.orden_visual,
                 CONCAT_WS(' ', u.nombre, u.apellido1, u.apellido2) AS usuario_nombre
             FROM Documento_Anexo a
             JOIN Usuario u ON u.id = a.usuario_id
             WHERE a.documento_id = ?
             ORDER BY a.orden_visual ASC, a.fecha_subida ASC, a.id ASC`,
            [documento_id]
        );

        return rows;
    },

    async deleteById(id) {
        const [result] = await pool.query(
            `DELETE FROM Documento_Anexo
             WHERE id = ?`,
            [id]
        );

        return result.affectedRows > 0;
    },
};
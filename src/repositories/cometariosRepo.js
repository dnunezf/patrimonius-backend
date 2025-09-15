import { pool } from "../db/pool.js";

/** Comentarios repository. SQL-only. */
export const comentariosRepo = {
    // Crear un nuevo comentario
    async createComentario(comentarioData) {
        const [result] = await pool.execute(
            `INSERT INTO Comentarios (usuario_id, documento_id, descripcion)
       VALUES (:usuarioId, :documentoId, :descripcion)`,
            comentarioData
        );
        return { id: result.insertId, ...comentarioData };
    },

    // Obtener todos los comentarios de un documento
    async getAllComentarios(documentoId) {
        const [rows] = await pool.query(
            `SELECT c.id, u.nombre AS usuario, c.descripcion, c.fecha
       FROM Comentarios c
       JOIN Usuario u ON c.usuario_id = u.id
       WHERE c.documento_id = :documentoId`,
            { documentoId }
        );
        return rows;
    },

    // Obtener un comentario por ID
    async getComentarioById(id) {
        const [rows] = await pool.query(
            `SELECT c.id, u.nombre AS usuario, c.descripcion, c.fecha
       FROM Comentarios c
       JOIN Usuario u ON c.usuario_id = u.id
       WHERE c.id = :id`,
            { id }
        );
        return rows[0] || null;
    },

    // Eliminar un comentario por ID
    async removeComentario(id) {
        await pool.execute(`DELETE FROM Comentarios WHERE id = :id`, { id });
    },
};
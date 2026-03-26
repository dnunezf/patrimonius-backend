// src/repositories/comentariosRepo.js
import { pool } from "../db/pool.js";

/** Comentarios repository. SQL-only. */
export const comentariosRepo = {
    // Crear un nuevo comentario
    async createComentario({ usuarioId, documentoId, descripcion }) {
        const [res] = await pool.query(
            `INSERT INTO Comentario (descripcion, usuario_id, documento_id, fecha, resuelto)
       VALUES (?, ?, ?, NOW(), FALSE)`,
            [descripcion, usuarioId, documentoId]
        );
        return { id: res.insertId, usuarioId, documentoId, descripcion };
    },

    // Obtener todos los comentarios de un documento
    async getAllComentarios(documentoId) {
        const [rows] = await pool.query(
            `SELECT c.id,
              u.id AS usuario_id,
              CONCAT(u.nombre, ' ', COALESCE(u.apellido1,''), ' ', COALESCE(u.apellido2,'')) AS usuario,
              c.descripcion,
              c.fecha,
              c.resuelto
       FROM Comentario c
       JOIN Usuario u ON c.usuario_id = u.id
       WHERE c.documento_id = ?
       ORDER BY c.fecha ASC`,
            [documentoId]
        );
        return rows;
    },

    // Obtener un comentario por ID
    async getComentarioById(id) {
        const [rows] = await pool.query(
            `SELECT c.*
       FROM Comentario c
       WHERE c.id = ?`,
            [id]
        );
        return rows[0] || null;
    },

    // Marcar comentario como resuelto
    async resolveComentario(id) {
        await pool.query(`UPDATE Comentario SET resuelto = TRUE WHERE id = ?`, [id]);
    },

    // Eliminar un comentario por ID
    async removeComentario(id) {
        await pool.query(`DELETE FROM Comentario WHERE id = ?`, [id]);
    },
};

/* === Alias compatibles con documentoService === */
export const comentarioRepo = {
    // listByDocumento(documento_id)
    async listByDocumento(documento_id) {
        return comentariosRepo.getAllComentarios(documento_id);
    },
    // insert({ documento_id, usuario_id, descripcion })
    async insert({ documento_id, usuario_id, descripcion }) {
        const created = await comentariosRepo.createComentario({
            usuarioId: usuario_id,
            documentoId: documento_id,
            descripcion,
        });
        return created.id;
    },
    // findById(id)
    async findById(id) {
        return comentariosRepo.getComentarioById(id);
    },
    // resolve(id)
    async resolve(id) {
        return comentariosRepo.resolveComentario(id);
    },
};

import { pool } from "../db/pool.js";

/** Notificación repository. SQL-only. */
export const notificacionRepo = {
    // Crear una nueva notificación
    async createNotificacion(notificacionData) {
        const [result] = await pool.execute(
            `INSERT INTO Notificacion (fecha, tipo, resultado, usuario_id, documento_id)
       VALUES (:fecha, :tipo, :resultado, :usuarioId, :documentoId)`,
            notificacionData
        );
        return { id: result.insertId, ...notificacionData };
    },

    // Obtener todas las notificaciones
    async getAllNotificaciones() {
        const [rows] = await pool.query(
            `SELECT n.id, n.fecha, n.tipo, n.resultado, u.nombre AS usuario, d.titulo AS documento
       FROM Notificacion n
       JOIN Usuario u ON n.usuario_id = u.id
       JOIN Documento d ON n.documento_id = d.id
       ORDER BY n.fecha DESC`
        );
        return rows;
    },

    // Obtener una notificación por ID
    async getNotificacionById(id) {
        const [rows] = await pool.query(
            `SELECT n.id, n.fecha, n.tipo, n.resultado, u.nombre AS usuario, d.titulo AS documento
       FROM Notificacion n
       JOIN Usuario u ON n.usuario_id = u.id
       JOIN Documento d ON n.documento_id = d.id
       WHERE n.id = :id`,
            { id }
        );
        return rows[0] || null;
    },

    // Eliminar una notificación por ID
    async removeNotificacion(id) {
        await pool.execute(`DELETE FROM Notificacion WHERE id = :id`, { id });
    },
};
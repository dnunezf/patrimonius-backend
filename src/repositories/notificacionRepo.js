// src/repositories/notificacionRepo.js
import { pool } from "../db/pool.js";

/** Notificación repository. SQL-only. */
export const notificacionRepo = {
    async createNotificacion(data) {
        // Asegurarse de que los valores sean explícitamente 'null' si están vacíos
        const notificacionData = {
            fecha: data.fecha || null,
            tipo: data.tipo || 'PLAZO_ASIGNADO', // Si no hay tipo, asignamos 'PLAZO_ASIGNADO'
            accion_requerida: data.accion_requerida || 'EDITAR',  // Valor por defecto
            fecha_limite: data.fecha_limite || null,
            enlace_directo: data.enlace_directo || null,
            resultado: data.resultado || 'PLAZO_ASIGNADO',
            usuario_id: data.usuario_id || null,
            documento_id: data.documento_id || null,
        };

        console.log("Datos de la notificación a insertar:", notificacionData);

        // Realizamos la consulta con los datos de la notificación
        const [result] = await pool.execute(
            `INSERT INTO Notificacion
             (fecha, tipo, accion_requerida, fecha_limite, enlace_directo, resultado, usuario_id, documento_id)
             VALUES
                 (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                notificacionData.fecha,
                notificacionData.tipo,
                notificacionData.accion_requerida,
                notificacionData.fecha_limite,
                notificacionData.enlace_directo,
                notificacionData.resultado,
                notificacionData.usuario_id,
                notificacionData.documento_id
            ]
        );

        return { id: result.insertId, ...notificacionData };
    },


    async listByUser(userId, { unreadOnly = false, limit = 30, offset = 0 } = {}) {
        const [rows] = await pool.query(
            `SELECT n.*, d.titulo AS documento_titulo
             FROM Notificacion n
                      JOIN Documento d ON d.id = n.documento_id
             WHERE n.usuario_id = :userId
               AND (:unreadOnly = 0 OR n.leida = 0)
             ORDER BY n.fecha DESC
                 LIMIT :limit OFFSET :offset`,
            { userId, unreadOnly: unreadOnly ? 1 : 0, limit, offset }
        );
        return rows;
    },

    async countUnreadByUser(userId) {
        const [[row]] = await pool.query(
            `SELECT COUNT(*) AS n
             FROM Notificacion
             WHERE usuario_id = :userId AND leida = 0`,
            { userId }
        );
        return Number(row?.n || 0);
    },

    async markRead(id, userId) {
        const [result] = await pool.execute(
            `UPDATE Notificacion
             SET leida = 1, leida_en = NOW()
             WHERE id = :id AND usuario_id = :userId`,
            { id, userId }
        );
        return Number(result.affectedRows || 0);
    },

    async markReadBulk(userId, ids = []) {
        const clean = Array.from(new Set(ids.map(Number))).filter(n => Number.isFinite(n) && n > 0);
        if (!clean.length) return 0;

        const placeholders = clean.map(() => "?").join(",");
        const [result] = await pool.query(
            `UPDATE Notificacion
             SET leida = 1, leida_en = NOW()
             WHERE usuario_id = ?
               AND id IN (${placeholders})
               AND leida = 0`,
            [userId, ...clean]
        );
        return Number(result?.affectedRows || 0);
    },
};
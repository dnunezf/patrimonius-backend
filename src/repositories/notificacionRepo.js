// src/repositories/notificacionRepo.js
import { pool } from "../db/pool.js";

/** Notificación repository. SQL-only. */
export const notificacionRepo = {
    async createNotificacion(data) {
        const [result] = await pool.execute(
            `INSERT INTO Notificacion
        (fecha, tipo, accion_requerida, fecha_limite, enlace_directo, resultado, usuario_id, documento_id)
       VALUES
        (:fecha, :tipo, :accionRequerida, :fechaLimite, :enlaceDirecto, :resultado, :usuarioId, :documentoId)`,
            data
        );
        return { id: result.insertId, ...data };
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

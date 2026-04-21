// src/repositories/notificacionRepo.js
import { pool } from "../db/pool.js";

function pickNumberOrNull(a, b) {
    const v = a !== undefined && a !== null ? a : b;
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Notificación repository. SQL-only. */
export const notificacionRepo = {
    async createNotificacion(data) {
        // notificacion.service usa camelCase (usuarioId, documentoId); otros callers snake_case
        const usuario_id = pickNumberOrNull(data.usuario_id, data.usuarioId);
        const documento_id = pickNumberOrNull(data.documento_id, data.documentoId);
        const fecha_limite =
            data.fecha_limite !== undefined && data.fecha_limite !== null
                ? data.fecha_limite
                : data.fechaLimite ?? null;
        const enlace_directo =
            data.enlace_directo !== undefined && data.enlace_directo !== null
                ? data.enlace_directo
                : data.enlaceDirecto ?? null;
        const accion_requerida =
            data.accion_requerida ?? data.accionRequerida ?? "EDITAR";

        const notificacionData = {
            fecha: data.fecha || null,
            tipo: data.tipo || "PLAZO_ASIGNADO",
            accion_requerida: accion_requerida || "EDITAR",
            fecha_limite: fecha_limite || null,
            enlace_directo: enlace_directo || null,
            resultado: data.resultado || "PLAZO_ASIGNADO",
            usuario_id,
            documento_id,
        };

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
                      LEFT JOIN Documento d ON d.id = n.documento_id
             WHERE n.usuario_id = :userId
               AND (:unreadOnly = 0 OR n.leida = 0)
             ORDER BY n.fecha DESC
                 LIMIT :limit OFFSET :offset`,
            { userId, unreadOnly: unreadOnly ? 1 : 0, limit, offset }
        );
        return rows;
    },

    /**
     * Evita reenviar el mismo aviso de vencimiento cumplido (mismo expediente, mismo usuario).
     * El enlace incluye `expVencId=<id>` (ver notificacion.service).
     */
    async existsNotificacionExpedienteConservacionVencido(usuarioId, expedienteId) {
        const uid = Number(usuarioId);
        const eid = Number(expedienteId);
        if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(eid) || eid <= 0) {
            return false;
        }
        const tipo = "EXPEDIENTE_CONSERVACION_VENCIDO";
        const like = `%expVencId=${eid}%`;
        const [rows] = await pool.query(
            `SELECT COUNT(*) AS n
             FROM Notificacion
             WHERE usuario_id = ?
               AND tipo = ?
               AND enlace_directo LIKE ?`,
            [uid, tipo, like]
        );
        return Number(rows?.[0]?.n || 0) > 0;
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
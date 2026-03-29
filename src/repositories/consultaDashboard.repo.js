// src/repositories/consultaDashboard.repo.js
import { pool } from "../db/pool.js";

export const consultaDashboardRepo = {
    /**
     * Actividad HU-025 en bitácora (búsqueda, vista previa, descarga).
     */
    async listHistorial({ userId, page = 1, pageSize = 20 }) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const offset = (p - 1) * ps;
        const uid = Number(userId);

        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS n FROM Bitacora_Base b
             WHERE b.usuario_id = ? AND b.accion LIKE 'HU025_%'`,
            [uid]
        );
        const totalItems = Number(countRows?.[0]?.n || 0);

        const [rows] = await pool.query(
            `SELECT b.id, b.fecha, b.accion, b.documento_id,
                    d.numero_serie AS codigo, d.titulo AS titulo,
                    a.actividad AS actividad
             FROM Bitacora_Base b
             LEFT JOIN Documento d ON d.id = b.documento_id
             INNER JOIN Bitacora_Actividad_Usuario a ON a.id = b.id
             WHERE b.usuario_id = ? AND b.accion LIKE 'HU025_%'
             ORDER BY b.fecha DESC
             LIMIT ? OFFSET ?`,
            [uid, ps, offset]
        );

        return {
            items: rows || [],
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / ps)),
            page: p,
            pageSize: ps,
        };
    },

    /** Por documento: veces descargado y última fecha/hora. */
    async listDescargasAgregadas(userId) {
        const [rows] = await pool.query(
            `SELECT b.documento_id,
                    d.numero_serie AS codigo,
                    d.titulo AS titulo,
                    COUNT(*) AS veces,
                    MAX(b.fecha) AS ultima_descarga
             FROM Bitacora_Base b
             INNER JOIN Bitacora_Actividad_Usuario a ON a.id = b.id AND a.actividad = 'DESCARGA'
             INNER JOIN Documento d ON d.id = b.documento_id
             WHERE b.usuario_id = ? AND b.documento_id IS NOT NULL
             GROUP BY b.documento_id, d.numero_serie, d.titulo
             ORDER BY ultima_descarga DESC`,
            [Number(userId)]
        );
        return rows || [];
    },

    /** Últimos N documentos distintos descargados por el usuario. */
    async listUltimasDescargas({ userId, limit = 3 }) {
        const lim = Math.min(10, Math.max(1, Number(limit) || 3));
        const [rows] = await pool.query(
            `SELECT sub.documento_id, sub.ultima AS fecha,
                    d.numero_serie AS codigo, d.titulo AS titulo, d.estado AS estado
             FROM (
                 SELECT b.documento_id, MAX(b.fecha) AS ultima
                 FROM Bitacora_Base b
                 INNER JOIN Bitacora_Actividad_Usuario a ON a.id = b.id AND a.actividad = 'DESCARGA'
                 WHERE b.usuario_id = ? AND b.documento_id IS NOT NULL
                 GROUP BY b.documento_id
             ) sub
             INNER JOIN Documento d ON d.id = sub.documento_id
             ORDER BY sub.ultima DESC
             LIMIT ?`,
            [Number(userId), lim]
        );
        return rows || [];
    },
};

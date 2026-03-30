// src/repositories/consultaDashboard.repo.js
import { pool } from "../db/pool.js";

/** Eventos de consulta en Bitacora_Base: formato nuevo (*_DOCUMENTO_I|_E) o legado CONSULTA_*. */
const SQL_CONSULTA_BITACORA_BASE = `(
  b.accion REGEXP '^(VISTA_PREVIA|DESCARGA|BUSQUEDA)_DOCUMENTO_[IE]$'
  OR b.accion REGEXP '^CONSULTA_'
)`;

const SQL_CONSULTA_DESCARGA_BASE = `(
  b.accion REGEXP '^DESCARGA_DOCUMENTO_[IE]$'
  OR b.accion REGEXP '^CONSULTA_DESCARGA_(INTERNO|EXTERNO)$'
)`;

function parseFechaDesde(fechaDesde) {
    if (fechaDesde == null || String(fechaDesde).trim() === "") return null;
    const d = new Date(fechaDesde);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

export const consultaDashboardRepo = {
    /**
     * Actividad de consulta aprobados en bitácora (búsqueda, descarga, vista previa).
     * @param {object} opts
     * @param {string|Date} [opts.fechaDesde] — solo filas con b.fecha >= este instante (p. ej. tras “limpiar” en el cliente).
     */
    async listHistorial({ userId, page = 1, pageSize = 20, fechaDesde = null }) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const offset = (p - 1) * ps;
        const uid = Number(userId);
        const desde = parseFechaDesde(fechaDesde);

        const whereParts = [`b.usuario_id = ?`, SQL_CONSULTA_BITACORA_BASE];
        const argsCount = [uid];
        const argsData = [uid];
        if (desde) {
            whereParts.push("b.fecha >= ?");
            argsCount.push(desde);
            argsData.push(desde);
        }
        const whereSql = `WHERE ${whereParts.join(" AND ")}`;

        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS n FROM Bitacora_Base b ${whereSql}`,
            argsCount
        );
        const totalItems = Number(countRows?.[0]?.n || 0);

        const [rows] = await pool.query(
            `SELECT b.id, b.fecha, b.accion, b.documento_id,
                    d.numero_serie AS codigo, d.titulo AS titulo,
                    CASE
                      WHEN b.accion REGEXP '^DESCARGA_DOCUMENTO_[IE]$'
                           OR b.accion REGEXP '^CONSULTA_DESCARGA_(INTERNO|EXTERNO)$' THEN 'DESCARGA'
                      WHEN b.accion REGEXP '^BUSQUEDA_DOCUMENTO_[IE]$'
                           OR b.accion REGEXP '^CONSULTA_BUSQUEDA_(INTERNO|EXTERNO)$' THEN 'BUSQUEDA'
                      WHEN b.accion REGEXP '^VISTA_PREVIA_DOCUMENTO_[IE]$'
                           OR b.accion REGEXP '^CONSULTA_VISTA_PREVIA_(INTERNO|EXTERNO)$' THEN 'VISTA'
                      ELSE 'OTRA'
                    END AS actividad
             FROM Bitacora_Base b
             LEFT JOIN Documento d ON d.id = b.documento_id
             ${whereSql}
             ORDER BY b.fecha DESC
             LIMIT ? OFFSET ?`,
            [...argsData, ps, offset]
        );

        return {
            items: rows || [],
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / ps)),
            page: p,
            pageSize: ps,
        };
    },

    /**
     * Por documento: veces descargado y última fecha/hora (paginado).
     */
    async listDescargasAgregadas({ userId, page = 1, pageSize = 20, fechaDesde = null }) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const offset = (p - 1) * ps;
        const uid = Number(userId);
        const desde = parseFechaDesde(fechaDesde);

        const innerWhere = [
            "b.usuario_id = ?",
            "b.documento_id IS NOT NULL",
            SQL_CONSULTA_DESCARGA_BASE,
        ];
        const innerArgs = [uid];
        if (desde) {
            innerWhere.push("b.fecha >= ?");
            innerArgs.push(desde);
        }
        const innerWhereSql = innerWhere.join(" AND ");

        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS n FROM (
                SELECT b.documento_id
                FROM Bitacora_Base b
                WHERE ${innerWhereSql}
                GROUP BY b.documento_id
            ) t`,
            innerArgs
        );
        const totalItems = Number(countRows?.[0]?.n || 0);

        const [rows] = await pool.query(
            `SELECT agg.documento_id, agg.codigo, agg.titulo, agg.veces, agg.ultima_descarga
             FROM (
                SELECT b.documento_id,
                       d.numero_serie AS codigo,
                       d.titulo AS titulo,
                       COUNT(*) AS veces,
                       MAX(b.fecha) AS ultima_descarga
                FROM Bitacora_Base b
                INNER JOIN Documento d ON d.id = b.documento_id
                WHERE ${innerWhereSql}
                GROUP BY b.documento_id, d.numero_serie, d.titulo
             ) agg
             ORDER BY agg.ultima_descarga DESC
             LIMIT ? OFFSET ?`,
            [...innerArgs, ps, offset]
        );

        return {
            items: rows || [],
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / ps)),
            page: p,
            pageSize: ps,
        };
    },

    /**
     * Top N documentos distintos por última descarga (sin paginación; pensado p. ej. top 15 en organizaciones con alto volumen).
     */
    async listUltimasDescargas({ userId, fechaDesde = null, limit = 15 }) {
        const lim = Math.min(15, Math.max(1, Number(limit) || 15));
        const uid = Number(userId);
        const desde = parseFechaDesde(fechaDesde);

        const subWhere = [
            "b.usuario_id = ?",
            "b.documento_id IS NOT NULL",
            SQL_CONSULTA_DESCARGA_BASE,
        ];
        const subArgs = [uid];
        if (desde) {
            subWhere.push("b.fecha >= ?");
            subArgs.push(desde);
        }
        const subWhereSql = subWhere.join(" AND ");

        const [rows] = await pool.query(
            `SELECT sub.documento_id, sub.ultima AS fecha,
                    d.numero_serie AS codigo, d.titulo AS titulo, d.estado AS estado
             FROM (
                 SELECT b.documento_id, MAX(b.fecha) AS ultima
                 FROM Bitacora_Base b
                 WHERE ${subWhereSql}
                 GROUP BY b.documento_id
             ) sub
             INNER JOIN Documento d ON d.id = sub.documento_id
             ORDER BY sub.ultima DESC
             LIMIT ?`,
            [...subArgs, lim]
        );

        const list = rows || [];
        return {
            items: list,
            totalItems: list.length,
            totalPages: 1,
            page: 1,
            pageSize: lim,
        };
    },
};

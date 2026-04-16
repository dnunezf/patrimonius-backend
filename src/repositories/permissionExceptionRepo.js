// src/repositories/permissionExceptionRepo.js
import { pool } from "../db/pool.js";

export const permissionExceptionRepo = {
    // Reemplaza todas las excepciones de un user+doc por las nuevas perms
    async upsert(userId, documentId, perms, reason) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // 1) borrar lo existente para ese user+doc
            await conn.query(
                `DELETE FROM Permiso_Usuario
         WHERE usuario_id = ? AND documento_id = ?`,
                [userId, documentId]
            );

            // 2) insertar lo nuevo (SIN created_at)
            if (Array.isArray(perms) && perms.length > 0) {
                const values = perms.map((p) => [userId, documentId, p, reason]);

                await conn.query(
                    `INSERT INTO Permiso_Usuario (usuario_id, documento_id, permiso, motive)
           VALUES ?`,
                    [values]
                );
            }

            await conn.commit();
            return true;
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    },

    // Lista paginada + filtros (retorna el shape que Angular espera)
    async listPaged({ page = 1, pageSize = 10, userId, categoriaId, estado, from, to }) {
        const p = Math.max(1, Number(page || 1));
        const ps = Math.max(1, Number(pageSize || 10));
        const offset = (p - 1) * ps;

        /** Filtros sobre Permiso_Usuario / Documento (subconsulta agg) */
        const innerWhere = [];
        const innerArgs = [];
        if (userId) {
            innerWhere.push("pu.usuario_id = ?");
            innerArgs.push(Number(userId));
        }
        if (categoriaId) {
            innerWhere.push("d.categoria_id = ?");
            innerArgs.push(Number(categoriaId));
        }
        if (estado) {
            innerWhere.push("d.estado = ?");
            innerArgs.push(String(estado).toUpperCase());
        }
        const innerWhereSql = innerWhere.length
            ? `AND ${innerWhere.join(" AND ")}`
            : "";

        /**
         * Fecha mostrada = instante del registro EXCEPTION_APPLY en bitácora (servidor al aplicar).
         * Se agrupa por target_usuario_id + documento_id (NO por usuario_id, que es el admin).
         */
        const bitacoraApplySubquery = `
      SELECT
        target_usuario_id,
        documento_id,
        MAX(fecha) AS fecha
      FROM Bitacora_Permisos
      WHERE accion = 'EXCEPTION_APPLY'
        AND tipo_flujo = 'EXCEPCION_ACCESO'
        AND estado_flujo = 'APROBADA'
        AND target_usuario_id IS NOT NULL
      GROUP BY target_usuario_id, documento_id
    `;

        /** Filtros por fecha (momento de aplicación; fallback legado: fecha del documento) */
        const outerWhere = [];
        const outerArgs = [];
        if (from) {
            outerWhere.push("COALESCE(bp.fecha, agg.doc_fecha) >= ?");
            outerArgs.push(`${from} 00:00:00`);
        }
        if (to) {
            outerWhere.push("COALESCE(bp.fecha, agg.doc_fecha) <= ?");
            outerArgs.push(`${to} 23:59:59`);
        }
        const outerWhereSql = outerWhere.length
            ? `WHERE ${outerWhere.join(" AND ")}`
            : "";

        /**
         * Subconsulta agg: GROUP BY solo (usuario_id, documento_id) para que
         * GROUP_CONCAT(permiso) sea correcto con ONLY_FULL_GROUP_BY y no se pierdan permisos.
         */
        /** doc_fecha: si no hay fila en Bitacora_Permisos, los filtros de fecha usan la fecha del documento */
        const aggSubquery = `
      SELECT
        pu.usuario_id AS userId,
        pu.documento_id AS documentId,
        GROUP_CONCAT(DISTINCT pu.permiso ORDER BY pu.permiso SEPARATOR ',') AS permissions,
        MAX(pu.motive) AS motive,
        MAX(d.fecha) AS doc_fecha
      FROM Permiso_Usuario pu
      INNER JOIN Documento d ON d.id = pu.documento_id
      WHERE 1 = 1
      ${innerWhereSql}
      GROUP BY pu.usuario_id, pu.documento_id
    `;

        const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT agg.userId
        FROM (${aggSubquery}) agg
        LEFT JOIN (${bitacoraApplySubquery}) bp
          ON bp.target_usuario_id = agg.userId
         AND bp.documento_id = agg.documentId
        ${outerWhereSql}
      ) t
    `;

        const [countRows] = await pool.query(countSql, [...innerArgs, ...outerArgs]);

        const totalItems = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(totalItems / ps));

        const itemsSql = `
      SELECT
        agg.userId,
        agg.documentId,
        CONCAT(u.nombre, ' ', u.apellido1, IFNULL(CONCAT(' ', u.apellido2), '')) AS user,
        u.email AS email,
        d.titulo AS titulo,
        d.numero_serie AS numero_serie,
        c.nombre AS categoria,
        d.estado AS estado,
        agg.permissions AS permissions,
        agg.motive AS motive,
        COALESCE(bp.fecha, agg.doc_fecha) AS created_at
      FROM (${aggSubquery}) agg
      JOIN Usuario u ON u.id = agg.userId
      JOIN Documento d ON d.id = agg.documentId
      LEFT JOIN Categoria c ON c.id = d.categoria_id
      LEFT JOIN (${bitacoraApplySubquery}) bp
        ON bp.target_usuario_id = agg.userId
       AND bp.documento_id = agg.documentId
      ${outerWhereSql}
      ORDER BY COALESCE(bp.fecha, agg.doc_fecha) DESC, agg.documentId DESC
      LIMIT ? OFFSET ?
    `;

        const [rows] = await pool.query(itemsSql, [
            ...innerArgs,
            ...outerArgs,
            ps,
            offset,
        ]);

        const items = (rows || []).map((r) => ({
            ...r,
            permissions:
                r.permissions != null ? String(r.permissions) : "",
        }));

        return { items, totalItems, totalPages, page: p, pageSize: ps };
    },

    async remove(userId, documentId) {
        await pool.query(
            `DELETE FROM Permiso_Usuario
       WHERE usuario_id = ? AND documento_id = ?`,
            [userId, documentId]
        );
        return true;
    },
};

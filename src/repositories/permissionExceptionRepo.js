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

        const where = [];
        const args = [];

        if (userId) { where.push("pu.usuario_id = ?"); args.push(Number(userId)); }
        if (categoriaId) { where.push("d.categoria_id = ?"); args.push(Number(categoriaId)); }
        if (estado) { where.push("d.estado = ?"); args.push(String(estado).toUpperCase()); }

        // filtros por fecha REAL (bitácora)
        if (from) { where.push("bp.fecha >= ?"); args.push(`${from} 00:00:00`); }
        if (to)   { where.push("bp.fecha <= ?"); args.push(`${to} 23:59:59`); }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        // totalItems
        const [countRows] = await pool.query(
            `
      SELECT COUNT(*) AS total
      FROM (
        SELECT pu.usuario_id, pu.documento_id
        FROM Permiso_Usuario pu
        JOIN Documento d ON d.id = pu.documento_id

        LEFT JOIN (
          SELECT usuario_id, documento_id, MAX(fecha) AS fecha
          FROM Bitacora_Permisos
          GROUP BY usuario_id, documento_id
        ) bp
          ON bp.usuario_id = pu.usuario_id
         AND bp.documento_id = pu.documento_id

        ${whereSql}
        GROUP BY pu.usuario_id, pu.documento_id
      ) t
      `,
            args
        );

        const totalItems = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(totalItems / ps));

        // items
        const [rows] = await pool.query(
            `
      SELECT
        pu.usuario_id AS userId,
        pu.documento_id AS documentId,

        CONCAT(u.nombre, ' ', u.apellido1, IFNULL(CONCAT(' ', u.apellido2), '')) AS user,
        u.email AS email,

        d.titulo AS titulo,
        d.numero_serie AS numero_serie,

        c.nombre AS categoria,
        d.estado AS estado,

        GROUP_CONCAT(DISTINCT pu.permiso ORDER BY pu.permiso SEPARATOR ',') AS permissions,
        MAX(pu.motive) AS motive,

        bp.fecha AS created_at

      FROM Permiso_Usuario pu
      JOIN Usuario u ON u.id = pu.usuario_id
      JOIN Documento d ON d.id = pu.documento_id
      LEFT JOIN Categoria c ON c.id = d.categoria_id

      LEFT JOIN (
        SELECT usuario_id, documento_id, MAX(fecha) AS fecha
        FROM Bitacora_Permisos
        GROUP BY usuario_id, documento_id
      ) bp
        ON bp.usuario_id = pu.usuario_id
       AND bp.documento_id = pu.documento_id

      ${whereSql}
      GROUP BY pu.usuario_id, pu.documento_id, bp.fecha
      ORDER BY bp.fecha DESC
      LIMIT ? OFFSET ?
      `,
            [...args, ps, offset]
        );

        return { items: rows || [], totalItems, totalPages, page: p, pageSize: ps };
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

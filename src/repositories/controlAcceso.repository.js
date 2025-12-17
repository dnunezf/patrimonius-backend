// src/repositories/controlAcceso.repository.js
import { pool } from "../db/pool.js";

/**
 * HU-003 - Control de Acceso por Unidad Organizacional
 * Paginación + filtros
 *
 * - Regla clave: el CREADOR siempre puede ver (y puede editar/firmar según estado)
 * - Considera roles múltiples (service envía roleIds[])
 */
export const controlAccesoRepo = {
    async listPaged({
                        userId,
                        userUnitId,
                        roleIds = [],

                        page = 1,
                        pageSize = 10,

                        categoryId,
                        status,
                        dateFrom,
                        dateTo,
                        search,
                    }) {
        const p = Math.max(1, Number(page || 1));
        const ps = Math.max(1, Number(pageSize || 10));
        const offset = (p - 1) * ps;

        const where = [];
        const args = [];

        // filtros doc
        if (categoryId) {
            where.push("d.categoria_id = ?");
            args.push(Number(categoryId));
        }

        if (status) {
            where.push("d.estado = ?");
            args.push(String(status).toUpperCase());
        }

        if (search && String(search).trim()) {
            where.push("(d.titulo LIKE ? OR d.numero_serie LIKE ?)");
            const q = `%${String(search).trim()}%`;
            args.push(q, q);
        }

        // filtros por fecha (bitácora si existe, si no fecha del documento)
        if (dateFrom) {
            where.push("COALESCE(bp.fecha, d.fecha) >= ?");
            args.push(`${dateFrom} 00:00:00`);
        }
        if (dateTo) {
            where.push("COALESCE(bp.fecha, d.fecha) <= ?");
            args.push(`${dateTo} 23:59:59`);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        // ===== totalItems =====
        const [countRows] = await pool.query(
            `
                SELECT COUNT(*) AS total
                FROM Documento d
                         JOIN Unidad_Organizacional u ON u.id = d.unidad_id
                         LEFT JOIN Categoria c ON c.id = d.categoria_id

                         LEFT JOIN (
                    SELECT usuario_id, documento_id, MAX(fecha) AS fecha
                    FROM Bitacora_Permisos
                    GROUP BY usuario_id, documento_id
                ) bp
                                   ON bp.usuario_id = ?
                                       AND bp.documento_id = d.id

                    ${whereSql}
            `,
            [Number(userId), ...args]
        );

        const totalItems = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(totalItems / ps));

        // ===== items =====
        const [docs] = await pool.query(
            `
                SELECT
                    d.id            AS id,
                    d.numero_serie  AS code,
                    d.titulo        AS title,
                    d.estado        AS status,
                    d.usuario_id    AS ownerId,

                    u.id            AS unitId,
                    u.nombre        AS unit,

                    c.nombre        AS categoria,

                    COALESCE(bp.fecha, d.fecha) AS created_at

                FROM Documento d
                         JOIN Unidad_Organizacional u ON u.id = d.unidad_id
                         LEFT JOIN Categoria c ON c.id = d.categoria_id

                         LEFT JOIN (
                    SELECT usuario_id, documento_id, MAX(fecha) AS fecha
                    FROM Bitacora_Permisos
                    GROUP BY usuario_id, documento_id
                ) bp
                                   ON bp.usuario_id = ?
                                       AND bp.documento_id = d.id

                    ${whereSql}
                ORDER BY COALESCE(bp.fecha, d.fecha) DESC
                    LIMIT ? OFFSET ?
            `,
            [Number(userId), ...args, ps, offset]
        );

        const docIds = (docs || []).map((d) => Number(d.id));
        if (!docIds.length) {
            return { items: [], totalItems, totalPages, page: p, pageSize: ps, accessibleCount: 0 };
        }

        // HU-005: Permiso_Usuario
        const [userPermsRows] = await pool.query(
            `
                SELECT documento_id, permiso
                FROM Permiso_Usuario
                WHERE usuario_id = ?
                  AND documento_id IN (?)
            `,
            [Number(userId), docIds]
        );

        // HU-002: Allowed_User
        const [allowedUsersRows] = await pool.query(
            `
                SELECT documento_id, actions
                FROM Documento_Allowed_User
                WHERE usuario_id = ?
                  AND documento_id IN (?)
            `,
            [Number(userId), docIds]
        );

        // HU-004: Allowed_Rol (roles múltiples)
        const safeRoleIds = Array.isArray(roleIds) && roleIds.length ? roleIds.map(Number) : [0];
        const [allowedRolesRows] = await pool.query(
            `
      SELECT documento_id, actions
      FROM Documento_Allowed_Rol
      WHERE rol_id IN (?)
        AND documento_id IN (?)
      `,
            [safeRoleIds, docIds]
        );

        // maps
        const permsByDoc = new Map(); // docId -> ["VIEW","EDIT","SIGN"]
        for (const r of userPermsRows || []) {
            const id = Number(r.documento_id);
            if (!permsByDoc.has(id)) permsByDoc.set(id, []);
            permsByDoc.get(id).push(String(r.permiso));
        }

        const allowedUserByDoc = new Map(); // docId -> "VIEW,EDIT"
        for (const r of allowedUsersRows || []) allowedUserByDoc.set(Number(r.documento_id), String(r.actions || ""));

        const allowedRoleByDoc = new Map(); // docId -> array of actions strings (puede haber varias filas)
        for (const r of allowedRolesRows || []) {
            const id = Number(r.documento_id);
            if (!allowedRoleByDoc.has(id)) allowedRoleByDoc.set(id, []);
            allowedRoleByDoc.get(id).push(String(r.actions || ""));
        }

        const items = (docs || []).map((doc) => {
            const sameUnit = Number(doc.unitId) === Number(userUnitId);
            const isOwner = Number(doc.ownerId) === Number(userId);

            // ✅ Base: unidad OR creador
            let canView = sameUnit || isOwner;
            let canEdit = (sameUnit || isOwner) && String(doc.status) !== "ARCHIVADO";
            let canSign =
                (sameUnit || isOwner) &&
                ["FIRMA", "FIRMA_PARCIAL"].includes(String(doc.status));

            // HU-005 (excepciones) — NO deben quitar acceso al creador
            const up = permsByDoc.get(Number(doc.id)) || [];
            if (up.length) {
                const exView = up.includes("VIEW");
                const exEdit = up.includes("EDIT");
                const exSign = up.includes("SIGN");

                canView = isOwner ? true : exView;
                canEdit = isOwner ? canEdit : exEdit;
                canSign = isOwner ? canSign : exSign;
            }

            // HU-002 (allowed user) — tampoco debe quitar acceso al creador
            const au = allowedUserByDoc.get(Number(doc.id));
            if (au) {
                const acts = au.split(",").map((x) => x.trim());
                const uView = acts.includes("VIEW");
                const uEdit = acts.includes("EDIT");
                const uSign = acts.includes("SIGN");

                canView = isOwner ? true : uView;
                canEdit = isOwner ? canEdit : uEdit;
                canSign = isOwner ? canSign : uSign;
            }

            // HU-004 (allowed rol) — solo si no hubo HU-005 / HU-002
            if (!up.length && !au) {
                const roleActsList = allowedRoleByDoc.get(Number(doc.id)) || [];
                if (roleActsList.length) {
                    const unionActs = new Set(
                        roleActsList
                            .flatMap((s) => String(s).split(","))
                            .map((x) => x.trim())
                            .filter(Boolean)
                    );

                    const rView = unionActs.has("VIEW");
                    const rEdit = unionActs.has("EDIT");
                    const rSign = unionActs.has("SIGN");

                    canView = (sameUnit || isOwner) ? true : rView || canView;
                    canEdit = isOwner ? canEdit : rEdit;
                    canSign = isOwner ? canSign : rSign;
                }
            }

            return { ...doc, canView, canEdit, canSign };
        });

        const accessibleCount = items.filter((d) => d.canView || d.canEdit || d.canSign).length;

        return { items, totalItems, totalPages, page: p, pageSize: ps, accessibleCount };
    },
};

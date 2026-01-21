// src/repositories/controlAcceso.repository.js
import { pool } from "../db/pool.js";

/**
 * HU-003 - Control de Acceso por Unidad Organizacional
 *
 * FIX REAL:
 * - Si existe AL MENOS una excepción aplicable al documento (por usuario o rol),
 *   esa excepción se interpreta como OVERRIDE / WHITELIST:
 *      -> solo lo que esté permitido queda true
 *      -> lo no mencionado queda false (aunque sea misma unidad)
 * - Precedencia por acción: DENY > ALLOW > BASE
 *
 * Soporta:
 * - ALLOW: VIEW, EDIT, SIGN
 * - DENY : DENY_VIEW | NO_VIEW | NOT_VIEW | !VIEW (igual para EDIT/SIGN)
 */
export const controlAccesoRepo = {
    async listPaged({
                        userId,
                        userUnitId,
                        roleIds = [],
                        caps = { canEdit: true, canSign: true },

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

        // HU-005: Permiso_Usuario (excepciones)
        const [userPermsRows] = await pool.query(
            `
                SELECT documento_id, permiso
                FROM Permiso_Usuario
                WHERE usuario_id = ?
                  AND documento_id IN (?)
            `,
            [Number(userId), docIds]
        );

        // HU-002: Allowed_User (excepciones)
        const [allowedUsersRows] = await pool.query(
            `
                SELECT documento_id, actions
                FROM Documento_Allowed_User
                WHERE usuario_id = ?
                  AND documento_id IN (?)
            `,
            [Number(userId), docIds]
        );

        // HU-004: Allowed_Rol (excepciones)
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

        // ===== maps =====
        const permsByDoc = new Map(); // docId -> ["VIEW","EDIT","DENY_EDIT"...]
        for (const r of userPermsRows || []) {
            const id = Number(r.documento_id);
            if (!permsByDoc.has(id)) permsByDoc.set(id, []);
            permsByDoc.get(id).push(String(r.permiso || "").trim());
        }

        const allowedUserByDoc = new Map(); // docId -> "VIEW,EDIT"
        for (const r of allowedUsersRows || []) {
            allowedUserByDoc.set(Number(r.documento_id), String(r.actions || ""));
        }

        const allowedRoleByDoc = new Map(); // docId -> array de strings "VIEW,EDIT"
        for (const r of allowedRolesRows || []) {
            const id = Number(r.documento_id);
            if (!allowedRoleByDoc.has(id)) allowedRoleByDoc.set(id, []);
            allowedRoleByDoc.get(id).push(String(r.actions || ""));
        }

        // ===== helpers allow/deny =====
        const normalizeToken = (t) => String(t || "").trim().toUpperCase();

        const parseToken = (raw) => {
            const t = normalizeToken(raw);
            if (!t) return null;

            if (t.startsWith("DENY_")) return { type: "DENY", act: t.replace("DENY_", "") };
            if (t.startsWith("NO_")) return { type: "DENY", act: t.replace("NO_", "") };
            if (t.startsWith("NOT_")) return { type: "DENY", act: t.replace("NOT_", "") };
            if (t.startsWith("!")) return { type: "DENY", act: t.slice(1) };

            return { type: "ALLOW", act: t };
        };

        const parseActionsList = (raw) => {
            const arr = Array.isArray(raw)
                ? raw
                : String(raw || "")
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean);

            const allow = new Set();
            const deny = new Set();

            for (const x of arr) {
                const p = parseToken(x);
                if (!p) continue;
                if (p.type === "DENY") deny.add(p.act);
                else allow.add(p.act);
            }
            return { allow, deny };
        };

        const items = (docs || []).map((doc) => {
            const sameUnit = Number(doc.unitId) === Number(userUnitId);
            const isOwner = Number(doc.ownerId) === Number(userId);
            const st = String(doc.status || "").toUpperCase();

            // restricciones por estado
            const canEditByState = st !== "ARCHIVADO";
            const canSignByState = ["FIRMA", "FIRMA_PARCIAL"].includes(st);

            // capacidades globales del usuario
            const userCanEdit = !!caps?.canEdit;
            const userCanSign = !!caps?.canSign;

            // ===== BASE (solo se usa si NO hay excepciones) =====
            let baseView = sameUnit || isOwner;
            let baseEdit = (sameUnit || isOwner) && userCanEdit;
            let baseSign = (sameUnit || isOwner) && userCanSign;

            // ===== acumular excepciones allow/deny =====
            const allow = new Set();
            const deny = new Set();

            let hasException = false;

            const addAllowDeny = (raw) => {
                const parsed = parseActionsList(raw);
                for (const x of parsed.allow) allow.add(x);
                for (const x of parsed.deny) deny.add(x);
            };

            // HU-005
            const up = permsByDoc.get(Number(doc.id)) || [];
            if (up.length) {
                hasException = true;
                addAllowDeny(up);
            }

            // HU-002
            const au = allowedUserByDoc.get(Number(doc.id));
            if (au) {
                hasException = true;
                addAllowDeny(au);
            }

            // HU-004 (si mantenés tu regla “solo si no hay up/au”, dejamos igual)
            if (!up.length && !au) {
                const roleActsList = allowedRoleByDoc.get(Number(doc.id)) || [];
                if (roleActsList.length) {
                    hasException = true;
                    addAllowDeny(roleActsList);
                }
            }

            /**
             * ✅ OVERRIDE MODE:
             * Si hay excepciones, se interpreta como WHITELIST:
             * - base se ignora
             * - lo no permitido queda false por omisión
             */
            if (hasException) {
                baseView = false;
                baseEdit = false;
                baseSign = false;
            }

            // ===== Precedencia: DENY > ALLOW > BASE =====
            let hasView = baseView || allow.has("VIEW");
            let hasEdit = (baseEdit || allow.has("EDIT")) && userCanEdit;
            let hasSign = (baseSign || allow.has("SIGN")) && userCanSign;

            // DENY override final
            if (deny.has("VIEW")) hasView = false;
            if (deny.has("EDIT")) hasEdit = false;
            if (deny.has("SIGN")) hasSign = false;

            // ===== acciones habilitadas ahora =====
            const canView = hasView;
            const canEdit = hasEdit && canEditByState;
            const canSign = hasSign && canSignByState;

            return { ...doc, canView, canEdit, canSign, hasSign };
        });

        const accessibleCount = items.filter((d) => d.canView || d.canEdit || d.canSign).length;

        return { items, totalItems, totalPages, page: p, pageSize: ps, accessibleCount };
    },
};

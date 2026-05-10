// src/services/controlAcceso.service.js
import { pool } from "../db/pool.js";
import { controlAccesoRepo } from "../repositories/controlAcceso.repository.js";

/**
 * Detecta si existe una columna en una tabla (MySQL).
 */
async function columnExists(tableName, columnName) {
    const [rows] = await pool.query(
        `
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
        `,
        [tableName, columnName]
    );

    return Number(rows?.[0]?.cnt || 0) > 0;
}

/**
 * Intenta resolver permisos globales del usuario (editar/firmar)
 * desde BD, según el esquema existente.
 *
 * Prioridad recomendada:
 * 1) Usuario.can_edit / Usuario.can_sign (caps globales reales)
 * 2) Usuario_Rol.* (si existiera)
 * 3) fallback_true (compat)
 */
async function resolveUserCaps(userId) {
    const candidates = [
        // Prioridad: Usuario (caps globales)
        { table: "Usuario", edit: "can_edit", sign: "can_sign" },
        { table: "Usuario", edit: "puede_editar", sign: "puede_firmar" },
        { table: "Usuario", edit: "permiso_editar", sign: "permiso_firmar" },

        // Opcional: si manejan caps por rol
        { table: "Usuario_Rol", edit: "can_edit", sign: "can_sign" },
        { table: "Usuario_Rol", edit: "puede_editar", sign: "puede_firmar" },
        { table: "Usuario_Rol", edit: "permiso_editar", sign: "permiso_firmar" },
    ];

    for (const c of candidates) {
        const hasEdit = await columnExists(c.table, c.edit);
        const hasSign = await columnExists(c.table, c.sign);

        if (!hasEdit || !hasSign) continue;

        try {
            if (c.table === "Usuario") {
                const [rows] = await pool.query(
                    `
                        SELECT ${c.edit} AS canEdit, ${c.sign} AS canSign
                        FROM Usuario
                        WHERE id = ?
                    `,
                    [userId]
                );

                return {
                    canEdit: !!Number(rows?.[0]?.canEdit || 0),
                    canSign: !!Number(rows?.[0]?.canSign || 0),
                    source: `Usuario.${c.edit}/${c.sign}`,
                };
            }

            if (c.table === "Usuario_Rol") {
                const [rows] = await pool.query(
                    `
                        SELECT MAX(${c.edit}) AS canEdit, MAX(${c.sign}) AS canSign
                        FROM Usuario_Rol
                        WHERE usuario_id = ?
                    `,
                    [userId]
                );

                return {
                    canEdit: !!Number(rows?.[0]?.canEdit || 0),
                    canSign: !!Number(rows?.[0]?.canSign || 0),
                    source: `Usuario_Rol.${c.edit}/${c.sign}`,
                };
            }
        } catch (e) {
            continue;
        }
    }

    return { canEdit: true, canSign: true, source: "fallback_true" };
}

export async function getAccessControl(user, query = {}) {
    const userId = user.id ?? user.userId ?? null;
    const userUnitId = user.unidadId ?? user.unidad_id ?? null;
    const userRolId = user.rolId ?? user.rol_id ?? null;

    if (!userId || !userUnitId || !userRolId) {
        throw new Error("Usuario no tiene id, unidad o rol asignado en el token");
    }

    // Roles múltiples: rol principal + Usuario_Rol
    const [roleRows] = await pool.query(
        `
            SELECT rol_id
            FROM Usuario_Rol
            WHERE usuario_id = ?
        `,
        [userId]
    );

    const roleIds = Array.from(
        new Set([
            Number(userRolId),
            ...(roleRows || []).map((r) => Number(r.rol_id)),
        ])
    );

    // Leer capacidades globales desde BD
    const caps = await resolveUserCaps(Number(userId));

    // Query params
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const categoryId = query.categoryId ?? query.categoriaId ?? null;
    const status = query.status ?? query.estado ?? null;
    const dateFrom = query.dateFrom ?? query.from ?? null;
    const dateTo = query.dateTo ?? query.to ?? null;
    const search = query.search ?? null;

    const paged = await controlAccesoRepo.listPaged({
        userId,
        userUnitId,
        roleIds,
        caps,
        page,
        pageSize,
        categoryId,
        status,
        dateFrom,
        dateTo,
        search,
    });

    // Nombre de unidad
    const [[unidadRow]] = await pool.query(
        `
            SELECT nombre
            FROM Unidad_Organizacional
            WHERE id = ?
        `,
        [userUnitId]
    );

    // Nombres de roles para UI
    const [rolesRows] = await pool.query(
        `
            SELECT nombre
            FROM Rol
            WHERE id IN (?)
        `,
        [roleIds.length ? roleIds : [userRolId]]
    );

    const roles = rolesRows.length
        ? rolesRows.map((r) => r.nombre)
        : [user.role || "Sin rol asignado"];

    const unidadNombre = unidadRow?.nombre ?? "Sin unidad asignada";

    return {
        user: {
            id: userId,
            email: user.email,
            roles,
            unidad: unidadNombre,
            unidadId: Number(userUnitId),
            caps: { ...caps },
        },

        items: paged.items || [],
        totalItems: paged.totalItems ?? 0,
        totalPages: paged.totalPages ?? 1,
        page: paged.page ?? Number(page),
        pageSize: paged.pageSize ?? Number(pageSize),
        accessibleCount: paged.accessibleCount ?? 0,

        documents: paged.items || [],
    };
}
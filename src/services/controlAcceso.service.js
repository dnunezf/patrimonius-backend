// src/services/controlAcceso.service.js
import { pool } from "../db/pool.js";
import { controlAccesoRepo } from "../repositories/controlAcceso.repository.js";

/**
 * Detecta si existe una columna en una tabla (MySQL).
 */
async function columnExists(tableName, columnName) {
    const [rows] = await pool.execute(
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
 * Soporta 2 patrones comunes:
 * A) Usuario_Rol tiene columnas (can_edit/can_sign) o (puede_editar/puede_firmar)
 * B) Usuario tiene columnas similares
 *
 * Si no encuentra nada, asume true (para no “romper” behavior anterior).
 */
async function resolveUserCaps(userId) {
    // candidatos (tabla, colEdit, colSign)
    const candidates = [
        { table: "Usuario_Rol", edit: "can_edit", sign: "can_sign" },
        { table: "Usuario_Rol", edit: "puede_editar", sign: "puede_firmar" },
        { table: "Usuario_Rol", edit: "permiso_editar", sign: "permiso_firmar" },

        { table: "Usuario", edit: "can_edit", sign: "can_sign" },
        { table: "Usuario", edit: "puede_editar", sign: "puede_firmar" },
        { table: "Usuario", edit: "permiso_editar", sign: "permiso_firmar" },
    ];

    for (const c of candidates) {
        const hasEdit = await columnExists(c.table, c.edit);
        const hasSign = await columnExists(c.table, c.sign);

        if (!hasEdit || !hasSign) continue;

        try {
            if (c.table === "Usuario_Rol") {
                // Si el usuario tiene varios roles/filas, tomamos el MAX (si alguna fila da 1/true => true)
                const [rows] = await pool.execute(
                    `
          SELECT
            MAX(${c.edit}) AS canEdit,
            MAX(${c.sign}) AS canSign
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

            if (c.table === "Usuario") {
                const [rows] = await pool.execute(
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
        } catch (e) {
            // si algo falla, probamos el siguiente candidato
            continue;
        }
    }

    // fallback: no encontramos columnas => no “rompemos” behavior, asumimos true
    return { canEdit: true, canSign: true, source: "fallback_true" };
}

export async function getAccessControl(user, query = {}) {
    const userId = user.id ?? user.userId ?? null;
    const userUnitId = user.unidadId ?? user.unidad_id ?? null;
    const userRolId = user.rolId ?? user.rol_id ?? null;

    if (!userId || !userUnitId || !userRolId) {
        throw new Error("Usuario no tiene id, unidad o rol asignado en el token");
    }

    // ✅ roles múltiples: rol principal + Usuario_Rol
    const [roleRows] = await pool.execute(
        `SELECT rol_id FROM Usuario_Rol WHERE usuario_id = ?`,
        [userId]
    );
    const roleIds = Array.from(
        new Set([Number(userRolId), ...(roleRows || []).map((r) => Number(r.rol_id))])
    );

    // ✅ leer capacidades globales (editar/firmar) que asignás al crear usuario
    const caps = await resolveUserCaps(Number(userId));

    // query params
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
        caps, // ✅ pasamos caps al repo
        page,
        pageSize,
        categoryId,
        status,
        dateFrom,
        dateTo,
        search,
    });

    // unidad nombre
    const [[unidadRow]] = await pool.execute(
        `SELECT nombre FROM Unidad_Organizacional WHERE id = ?`,
        [userUnitId]
    );

    // nombres de roles (para UI)
    const [rolesRows] = await pool.execute(
        `SELECT nombre FROM Rol WHERE id IN (?)`,
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

            // útil para debug (opcional)
            caps: { ...caps },
        },

        // nuevo (paginado)
        items: paged.items || [],
        totalItems: paged.totalItems ?? 0,
        totalPages: paged.totalPages ?? 1,
        page: paged.page ?? Number(page),
        pageSize: paged.pageSize ?? Number(pageSize),
        accessibleCount: paged.accessibleCount ?? 0,

        // viejo (compat)
        documents: paged.items || [],
    };
}

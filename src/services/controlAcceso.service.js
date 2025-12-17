// src/services/controlAcceso.service.js
import { pool } from "../db/pool.js";
import { controlAccesoRepo } from "../repositories/controlAcceso.repository.js";

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

    // ✅ ALIAS para NO romper tu frontend viejo:
    // - documents: lo que tu pantalla actual espera
    // - accessibleCount: lo que tu pantalla actual espera
    // - items + paginación: lo nuevo para filtros/pager
    return {
        user: {
            id: userId,
            email: user.email,
            roles,
            unidad: unidadNombre,
            unidadId: Number(userUnitId),
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

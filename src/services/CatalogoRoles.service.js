// src/services/CatalogoRoles.service.js
import { catalogoRolesRepo } from "../repositories/catalogoRolesRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

/** Servicio de administración de roles para HU-003 */
export const catalogoRolesService = {
    async create(data, actor) {
        // Crear el nuevo rol
        const created = await catalogoRolesRepo.create({
            nombre: data.nombre,
            descripcion: data.descripcion,
        });

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "ROLE_CREATE",
            result: "OK",
            detail: { rolId: created.id, nombre: data.nombre },
        });

        return created;
    },

    async list() {
        // Listar todos los roles
        return catalogoRolesRepo.findAll();
    },

    async update(id, patch, actor) {
        const map = {};
        if (patch.nombre !== undefined) map.nombre = patch.nombre;
        if (patch.descripcion !== undefined) map.descripcion = patch.descripcion;

        // Actualizar rol
        const updated = await catalogoRolesRepo.update(id, map);
        if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "ROLE_UPDATE",
            result: "OK",
            detail: { rolId: id, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        // Eliminar rol
        await catalogoRolesRepo.remove(id);

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "ROLE_DELETE",
            result: "OK",
            detail: { rolId: id },
        });
    },
};

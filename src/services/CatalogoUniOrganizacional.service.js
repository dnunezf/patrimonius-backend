// src/services/CatalogoUniOrganizacional.service.js
import { catalogoUniOrganizacionalRepo } from "../repositories/catalogoUniOrganizacionalRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

/** Servicio de administración de unidades organizacionales para HU-004 */
export const catalogoUniOrganizacionalService = {
    async create(data, actor) {
        // Crear la nueva unidad organizacional
        const created = await catalogoUniOrganizacionalRepo.create({
            nombre: data.nombre,
            descripcion: data.descripcion,
        });

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "UNIT_CREATE",
            result: "OK",
            detail: { unidadId: created.id, nombre: data.nombre },
        });

        return created;
    },

    async list() {
        // Listar todas las unidades organizacionales
        return catalogoUniOrganizacionalRepo.findAll();
    },

    async update(id, patch, actor) {
        const map = {};
        if (patch.nombre !== undefined) map.nombre = patch.nombre;
        if (patch.descripcion !== undefined) map.descripcion = patch.descripcion;

        // Actualizar unidad organizacional
        const updated = await catalogoUniOrganizacionalRepo.update(id, map);
        if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "UNIT_UPDATE",
            result: "OK",
            detail: { unidadId: id, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        // Eliminar unidad organizacional
        await catalogoUniOrganizacionalRepo.remove(id);

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "UNIT_DELETE",
            result: "OK",
            detail: { unidadId: id },
        });
    },
};

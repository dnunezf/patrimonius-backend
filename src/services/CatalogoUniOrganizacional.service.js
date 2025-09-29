import { catalogoUniOrganizacionalRepo } from "../repositories/catalogoUniOrganizacionalRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

/** Servicio de administración de unidades organizacionales para HU-004 */
export const unidadService = {
    async create(data, actor) {
        // Validación de datos
        if (!data.nombre || !data.descripcion) {
            throw new Error('El nombre y la descripción son obligatorios');
        }

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
        try {
            // Listar todas las unidades organizacionales
            return catalogoUniOrganizacionalRepo.findAll();
        } catch (err) {
            throw new Error('Error al obtener las unidades organizacionales');
        }
    },

    async update(id, patch, actor) {
        if (!id || (!patch.nombre && !patch.descripcion)) {
            throw new Error('Debe proporcionar el ID y al menos un campo para actualizar');
        }

        const map = {};
        if (patch.nombre !== undefined) map.nombre = patch.nombre;
        if (patch.descripcion !== undefined) map.descripcion = patch.descripcion;

        // Actualizar unidad organizacional
        const updated = await catalogoUniOrganizacionalRepo.update(id, map);
        if (!updated) throw new Error("Unidad organizacional no encontrada");

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
        if (!id) {
            throw new Error('Debe proporcionar el ID de la unidad organizacional');
        }

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

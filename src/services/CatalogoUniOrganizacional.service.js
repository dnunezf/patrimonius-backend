import { catalogoUniOrganizacionalRepo } from "../repositories/catalogoUniOrganizacionalRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

/** Servicio de administración de unidades organizacionales para HU-004 */
export const unidadService = {
    async create(data, actor) {
        if (!data?.nombre?.trim()) {
            const err = new Error("El nombre es obligatorio");
            err.code = "bad_request";
            throw err;
        }

        const actorId = actor?.id ?? 0; // 0 = MASTER/SYSTEM

        const descripcion =
            data.descripcion === undefined || data.descripcion === null
                ? null
                : String(data.descripcion).trim() || null;

        const created = await catalogoUniOrganizacionalRepo.create({
            nombre: data.nombre.trim(),
            descripcion,
        });

        await logAdminAction({
            actorId, // ahora nunca es null
            action: "UNIT_CREATE",
            result: "OK",
            detail: { unidadId: created.id, nombre: created.nombre },
        });

        return created;
    }
    ,

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
            const err = new Error("Debe proporcionar el ID de la unidad organizacional");
            err.code = "bad_request";
            throw err;
        }

        const ok = await catalogoUniOrganizacionalRepo.remove(id);
        if (!ok) return false; // ✅ esto es lo que el route espera

        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "UNIT_DELETE",
            result: "OK",
            detail: { unidadId: id },
        });

        return true; // ✅ IMPORTANTÍSIMO
    }

    ,
};

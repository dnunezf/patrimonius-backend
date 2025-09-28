import { catalogoPlantillasRepo } from "../repositories/catalogoPlantillasRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

export const plantillaService = {
    async create(data, actor) {
        try {
            // Crear la plantilla en la base de datos
            const created = await catalogoPlantillasRepo.create({
                nombre: data.nombre,
                descripcion: data.descripcion,
                ruta_archivo: data.ruta_archivo,
            });

            // Log de la acción del administrador
            await logAdminAction({
                actorId: actor?.id ?? null,
                action: "TEMPLATE_CREATE",
                result: "OK",
                detail: { plantillaId: created.id, nombre: data.nombre },
            });

            return created;
        } catch (e) {
            throw new Error(`Error al crear la plantilla: ${e.message}`);
        }
    },

    async list() {
        try {
            // Obtener todas las plantillas
            const templates = await catalogoPlantillasRepo.findAll();
            if (!templates || templates.length === 0) {
                throw new Error('No se encontraron plantillas');
            }
            return templates;
        } catch (e) {
            throw new Error(`Error al obtener las plantillas: ${e.message}`);
        }
    },

    async update(id, patch, actor) {
        try {
            const map = {};
            if (patch.nombre !== undefined) map.nombre = patch.nombre;
            if (patch.descripcion !== undefined) map.descripcion = patch.descripcion;
            if (patch.ruta_archivo !== undefined) map.ruta_archivo = patch.ruta_archivo;

            // Actualizar la plantilla
            const updated = await catalogoPlantillasRepo.update(id, map);
            if (!updated) throw new Error("Plantilla no encontrada");

            // Log de la acción del administrador
            await logAdminAction({
                actorId: actor?.id ?? null,
                action: "TEMPLATE_UPDATE",
                result: "OK",
                detail: { plantillaId: id, patch },
            });

            return updated;
        } catch (e) {
            throw new Error(`Error al actualizar la plantilla: ${e.message}`);
        }
    },

    async remove(id, actor) {
        try {
            // Eliminar la plantilla
            await catalogoPlantillasRepo.remove(id);

            // Log de la acción del administrador
            await logAdminAction({
                actorId: actor?.id ?? null,
                action: "TEMPLATE_DELETE",
                result: "OK",
                detail: { plantillaId: id },
            });
        } catch (e) {
            throw new Error(`Error al eliminar la plantilla: ${e.message}`);
        }
    },
};

// src/services/CatalogoPlantillas.service.js
import { catalogoPlantillasRepo } from "../repositories/catalogoPlantillasRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";


export const catalogoPlantillasService = {
    async create(data, actor) {
        // Crear la plantilla
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
    },

    async list() {
        // Listar todas las plantillas
        return catalogoPlantillasRepo.findAll();
    },

    async update(id, patch, actor) {
        const map = {};
        if (patch.nombre !== undefined) map.nombre = patch.nombre;
        if (patch.descripcion !== undefined) map.descripcion = patch.descripcion;
        if (patch.ruta_archivo !== undefined) map.ruta_archivo = patch.ruta_archivo;

        // Actualizar plantilla
        const updated = await catalogoPlantillasRepo.update(id, map);
        if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "TEMPLATE_UPDATE",
            result: "OK",
            detail: { plantillaId: id, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        // Eliminar plantilla
        await catalogoPlantillasRepo.remove(id);

        // Log de la acción del administrador
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "TEMPLATE_DELETE",
            result: "OK",
            detail: { plantillaId: id },
        });
    },
};

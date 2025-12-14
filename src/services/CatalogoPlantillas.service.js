// src/services/plantilla.service.js
import path from "path";
import { catalogoPlantillasRepo } from "../repositories/catalogoPlantillasRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

function normalizeRutaArchivo(ruta_archivo) {
    if (!ruta_archivo) return null;
    // Si ya viene como /plantillas/archivo.docx la dejamos igual
    if (ruta_archivo.startsWith("/plantillas/")) return ruta_archivo;
    // Si viene como ruta física, nos quedamos con el filename y la mapeamos
    const filename = path.basename(ruta_archivo);
    return `/plantillas/${filename}`;
}

export const plantillaService = {
    /** Crear plantilla (con o sin archivo, actor opcional) */
    async create(data, actor = null) {
        try {
            const payload = {
                nombre: data.nombre?.trim(),
                descripcion: data.descripcion ?? null,
                version: (data.version ?? "1.0").toString().trim(),
                ruta_archivo: normalizeRutaArchivo(data.ruta_archivo),
            };

            if (!payload.nombre) throw new Error("El nombre es obligatorio");
            if (!payload.version) throw new Error("La versión es obligatoria");
            if (!payload.ruta_archivo) throw new Error("La ruta del archivo es obligatoria");

            const created = await catalogoPlantillasRepo.create(payload);

            // Log (si hay actor)
            if (actor?.id) {
                await logAdminAction({
                    actorId: actor.id,
                    action: "TEMPLATE_CREATE",
                    result: "OK",
                    detail: { plantillaId: created.id, nombre: payload.nombre },
                });
            }

            return created;
        } catch (e) {
            throw new Error(`Error al crear la plantilla: ${e.message}`);
        }
    },

    /** Obtener todas (no lanzar error si no hay) */
    async list() {
        try {
            const templates = await catalogoPlantillasRepo.findAll();
            return Array.isArray(templates) ? templates : [];
        } catch (e) {
            throw new Error(`Error al obtener las plantillas: ${e.message}`);
        }
    },

    /** Obtener una por id (usada al crear documento desde plantilla) */
    async get(id) {
        try {
            const row = await catalogoPlantillasRepo.findById(id);
            if (!row) {
                const err = new Error("Plantilla no encontrada");
                err.code = 404;
                throw err;
            }
            return row;
        } catch (e) {
            if (e.code === 404) throw e;
            throw new Error(`Error al obtener la plantilla: ${e.message}`);
        }
    },

    /** Actualizar parcial; normaliza ruta si viene física */
    async update(id, patch, actor = null) {
        try {
            const map = {};
            if (patch.nombre !== undefined) map.nombre = patch.nombre?.trim();
            if (patch.descripcion !== undefined) map.descripcion = patch.descripcion ?? null;
            if (patch.version !== undefined) map.version = patch.version?.toString().trim();
            if (patch.ruta_archivo !== undefined) {
                map.ruta_archivo = normalizeRutaArchivo(patch.ruta_archivo);
            }

            const updated = await catalogoPlantillasRepo.update(id, map);
            if (!updated) {
                const err = new Error("Plantilla no encontrada");
                err.code = 404;
                throw err;
            }

            if (actor?.id) {
                await logAdminAction({
                    actorId: actor.id,
                    action: "TEMPLATE_UPDATE",
                    result: "OK",
                    detail: { plantillaId: id, patch: map },
                });
            }

            return updated;
        } catch (e) {
            if (e.code === 404) throw e;
            throw new Error(`Error al actualizar la plantilla: ${e.message}`);
        }
    },

    /** Eliminar */
    async remove(id, actor = null) {
        try {
            const ok = await catalogoPlantillasRepo.remove(id); // asegúrate que devuelva true/rowsAffected
            if (!ok) {
                const err = new Error("Plantilla no encontrada");
                err.code = 404;
                throw err;
            }

            if (actor?.id) {
                await logAdminAction({
                    actorId: actor.id,
                    action: "TEMPLATE_DELETE",
                    result: "OK",
                    detail: { plantillaId: id },
                });
            }
            return { ok: true };
        } catch (e) {
            if (e.code === 404) throw e;
            throw new Error(`Error al eliminar la plantilla: ${e.message}`);
        }
    },
};

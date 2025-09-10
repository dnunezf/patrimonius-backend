import { indiceRepo } from "../repositories/indiceRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Si es necesario para registrar las acciones

/** Core for managing Índice Electrónico. */
export const indiceService = {
    async create(indiceData, actor) {
        // Crear el índice electrónico
        const created = await indiceRepo.createIndex({
            hash: indiceData.hash,
            fecha: indiceData.fecha,
            firmaId: indiceData.firmaId,
        });

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "INDICE_CREATE",
            result: "OK",
            detail: { indiceId: created.id, hash: indiceData.hash },
        });

        return created;
    },

    async list() {
        return indiceRepo.getAllIndices();
    },

    async update(id, patch, actor) {
        const updateData = {};
        if (patch.hash !== undefined) updateData.hash = patch.hash;
        if (patch.fecha !== undefined) updateData.fecha = patch.fecha;
        if (patch.firmaId !== undefined) updateData.firmaId = patch.firmaId;

        // Actualizar el índice
        const updated = await indiceRepo.updateIndex(id, updateData);
        if (!updated) throw Object.assign(new Error("Indice no encontrado"), { code: 404 });

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "INDICE_UPDATE",
            result: "OK",
            detail: { indiceId: id, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        await indiceRepo.removeIndex(id);

        // Registrar la eliminación en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "INDICE_DELETE",
            result: "OK",
            detail: { indiceId: id },
        });
    },
};
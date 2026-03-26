//src/services/metadato.service.js
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Si es necesario

/** Core for managing Metadatos. */
export const metadatoService = {
    async create(metadatoData, actor) {
        // Crear un nuevo metadato
        const created = await metadatoRepo.createMetadato(metadatoData);

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "METADATO_CREATE",
            result: "OK",
            detail: { metadatoId: created.id, tipo: metadatoData.tipo },
        });

        return created;
    },

    async list(documentoId) {
        return metadatoRepo.getAllMetadatos(documentoId);
    },

    async update(id, patch, actor) {
        const updated = await metadatoRepo.updateMetadato(id, patch);
        if (!updated) throw Object.assign(new Error("Metadato no encontrado"), { code: 404 });

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "METADATO_UPDATE",
            result: "OK",
            detail: { metadatoId: id, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        await metadatoRepo.removeMetadato(id);

        // Registrar la eliminación en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "METADATO_DELETE",
            result: "OK",
            detail: { metadatoId: id },
        });
    },
};
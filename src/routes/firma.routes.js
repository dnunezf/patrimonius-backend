//src/routes/firma.routes.js
import { firmaRepo } from "../repositories/firmaRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Si es necesario

/** Core for managing Firmas. */
export const firmaService = {
    async create(firmaData, actor) {
        // Crear una nueva firma
        const created = await firmaRepo.createFirma(firmaData);

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "FIRMA_CREATE",
            result: "OK",
            detail: { firmaId: created.id, documentoId: firmaData.documento_id },
        });

        return created;
    },

    async list(documentoId) {
        return firmaRepo.getAllFirmas(documentoId);
    },

    async update(id, patch, actor) {
        const updated = await firmaRepo.updateFirma(id, patch);
        if (!updated) throw Object.assign(new Error("Firma no encontrada"), { code: 404 });

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "FIRMA_UPDATE",
            result: "OK",
            detail: { firmaId: id, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        await firmaRepo.removeFirma(id);

        // Registrar la eliminación en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "FIRMA_DELETE",
            result: "OK",
            detail: { firmaId: id },
        });
    },
};
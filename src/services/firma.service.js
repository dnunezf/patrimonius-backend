// src/services/firma.service.js
import { firmaRepo } from "../repositories/firmaRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

function asInt(v, name) {
    const n = Number(v);
    if (!Number.isFinite(n)) {
        const e = new Error(`${name} inválido`);
        e.code = 400;
        throw e;
    }
    return n;
}

export const firmaService = {
    async create(dto, actor) {
        const documento_id = asInt(dto?.documento_id ?? dto?.documentId, "documento_id");
        const usuario_id = asInt(dto?.usuario_id ?? dto?.usuarioId, "usuario_id");
        const fecha = dto?.fecha ? new Date(dto.fecha) : new Date();

        const created = await firmaRepo.createFirma({ documento_id, usuario_id, fecha });

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: documento_id,
            action: "FIRMA_CREATE",
            result: "OK",
            detail: { firmaId: created.id, documentoId: documento_id, usuarioId: usuario_id },
        });

        return created;
    },

    async listByDocumento(documentoId) {
        const docId = asInt(documentoId, "documentoId");
        return firmaRepo.getAllFirmas(docId);
    },

    async getById(id) {
        const firmaId = asInt(id, "id");
        const row = await firmaRepo.getFirmaById(firmaId);
        if (!row) {
            const e = new Error("Firma no encontrada");
            e.code = 404;
            throw e;
        }
        return row;
    },

    async update(id, patch, actor) {
        const firmaId = asInt(id, "id");

        const documento_id = patch?.documento_id !== undefined ? asInt(patch.documento_id, "documento_id") : undefined;
        const usuario_id = patch?.usuario_id !== undefined ? asInt(patch.usuario_id, "usuario_id") : undefined;
        const fecha = patch?.fecha !== undefined ? new Date(patch.fecha) : undefined;

        const current = await firmaRepo.getFirmaById(firmaId);
        if (!current) {
            const e = new Error("Firma no encontrada");
            e.code = 404;
            throw e;
        }

        const updated = await firmaRepo.updateFirma(firmaId, {
            documento_id: documento_id ?? current.documento_id,
            usuario_id: usuario_id ?? current.usuario_id,
            fecha: fecha ?? current.fecha,
        });

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: updated.documento_id ?? null,
            action: "FIRMA_UPDATE",
            result: "OK",
            detail: { firmaId, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        const firmaId = asInt(id, "id");

        const current = await firmaRepo.getFirmaById(firmaId);
        if (!current) {
            const e = new Error("Firma no encontrada");
            e.code = 404;
            throw e;
        }

        await firmaRepo.removeFirma(firmaId);

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: current.documento_id ?? null,
            action: "FIRMA_DELETE",
            result: "OK",
            detail: { firmaId, documentoId: current.documento_id, usuarioId: current.usuario_id },
        });

        return true;
    },
};
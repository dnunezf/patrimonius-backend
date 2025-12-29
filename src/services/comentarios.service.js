// BACKEND: src/services/comentarios.service.js
import { comentariosRepo } from "../repositories/comentariosRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

export const comentariosService = {
    async create({ usuarioId, documentoId, descripcion }, actor) {
        await comentariosRepo.createComentario({ usuarioId, documentoId, descripcion });

        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "COMENTARIO_CREATE",
            result: "OK",
            detail: { documentoId, descripcion },
        });

        return comentariosRepo.getAllComentarios(documentoId); // ✅ lista
    },

    async list(documentoId) {
        return comentariosRepo.getAllComentarios(documentoId);
    },

    async resolve(id, actor) {
        const prev = await comentariosRepo.getComentarioById(id);
        if (!prev) return [];

        await comentariosRepo.resolveComentario(id);

        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "COMENTARIO_RESOLVE",
            result: "OK",
            detail: { comentarioId: id, documentoId: prev.documento_id },
        });

        return comentariosRepo.getAllComentarios(prev.documento_id); // ✅ lista
    },
};

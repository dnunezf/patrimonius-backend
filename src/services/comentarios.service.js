//src/services/comentarios.service.js
import { comentariosRepo } from "../repositories/comentariosRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Si es necesario

/** Core for managing Comentarios. */
export const comentariosService = {
    async create(comentarioData, actor) {
        // Crear un nuevo comentario
        const created = await comentariosRepo.createComentario(comentarioData);

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "COMENTARIO_CREATE",
            result: "OK",
            detail: { comentarioId: created.id, descripcion: comentarioData.descripcion },
        });

        return created;
    },

    async list(documentoId) {
        return comentariosRepo.getAllComentarios(documentoId);
    },

    async remove(id, actor) {
        await comentariosRepo.removeComentario(id);

        // Registrar la eliminación en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "COMENTARIO_DELETE",
            result: "OK",
            detail: { comentarioId: id },
        });
    },
};
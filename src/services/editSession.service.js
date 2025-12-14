//src/services/editSession.service.js
import { editSessionRepo } from "../repositories/editSessionRepo.js";

export const editSessionService = {
    // registrar o renovar presencia
    async touch(documento_id, usuario_id) {
        await editSessionRepo.upsert(documento_id, usuario_id);
        return { ok: true };
    },

    // listar usuarios activos en este documento
    async list(documento_id, timeoutSeconds = 60) {
        return editSessionRepo.listActive(documento_id, timeoutSeconds);
    },

    // cerrar sesión explícita
    async remove(documento_id, usuario_id) {
        await editSessionRepo.remove(documento_id, usuario_id);
        return { ok: true };
    }
};

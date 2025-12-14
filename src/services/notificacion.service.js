//src/services/notificacion.service.js
import { notificacionRepo } from "../repositories/notificacionRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Si es necesario

/** Core for managing Notificaciones. */
export const notificacionService = {
    async create(notificacionData, actor) {
        // Crear una nueva notificación
        const created = await notificacionRepo.createNotificacion(notificacionData);

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "NOTIFICACION_CREATE",
            result: "OK",
            detail: { notificacionId: created.id, tipo: notificacionData.tipo },
        });

        return created;
    },

    async list() {
        return notificacionRepo.getAllNotificaciones();
    },

    async remove(id, actor) {
        await notificacionRepo.removeNotificacion(id);

        // Registrar la eliminación en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "NOTIFICACION_DELETE",
            result: "OK",
            detail: { notificacionId: id },
        });
    },
};
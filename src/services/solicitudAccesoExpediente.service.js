import { solicitudAccesoExpedienteRepo } from "../repositories/solicitudAccesoExpedienteRepo.js";
import expedienteRepo from "../repositories/expedienteRepo.js";
import { pool } from "../db/pool.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";

async function safeAudit({
                             fecha,
                             accion,
                             resultado,
                             usuario_id,
                             detalle,
                             recurso = "SOLICITUD_ACCESO_EXPEDIENTE",
                         }) {
    try {
        const baseId = await bitacoraRepo.insertBase({
            fecha: fecha ?? new Date(),
            accion,
            resultado,
            usuario_id,
            documento_id: null,
        });

        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: "NAVEGACION",
            recurso,
            parametros: JSON.stringify(detalle ?? {}),
            accion,
        });

        return baseId;
    } catch (err) {
        console.warn("⚠️ Falló bitácora solicitud acceso expediente:", err.message);
        return null;
    }
}

export const solicitudAccesoExpedienteService = {
    async createSolicitud({ justificacion, usuario_solicitante_id, expediente_id }) {
        if (!justificacion || !String(justificacion).trim()) {
            const e = new Error("La justificación es obligatoria.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const expediente = await expedienteRepo.getById(expediente_id);
        if (!expediente) {
            const e = new Error("El expediente no existe.");
            e.code = "NOT_FOUND";
            throw e;
        }

        const pending =
            await solicitudAccesoExpedienteRepo.findPendingByUsuarioAndExpediente(
                usuario_solicitante_id,
                expediente_id,
            );

        if (pending) {
            const e = new Error("Ya existe una solicitud pendiente para este expediente.");
            e.code = "CONFLICT";
            throw e;
        }

        const created = await solicitudAccesoExpedienteRepo.create({
            justificacion: String(justificacion).trim(),
            usuario_solicitante_id,
            expediente_id,
            estado_solicitud: "PENDIENTE",
        });

        await safeAudit({
            accion: "SOLICITUD_ACCESO_EXPEDIENTE_CREADA",
            resultado: "PERMITIDO",
            usuario_id: usuario_solicitante_id,
            detalle: {
                solicitud_id: created.id,
                expediente_id,
                estado_solicitud: created.estado_solicitud,
            },
        });

        return await solicitudAccesoExpedienteRepo.findByIdDetailed(created.id);
    },

    async resolveSolicitud({
                               solicitud_id,
                               admin_responsable_id,
                               estado_solicitud,
                               motivo_resolucion,
                           }) {
        const estadosValidos = ["APROBADA", "RECHAZADA"];
        if (!estadosValidos.includes(String(estado_solicitud))) {
            const e = new Error("El estado debe ser APROBADA o RECHAZADA.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        if (!motivo_resolucion || !String(motivo_resolucion).trim()) {
            const e = new Error("El motivo de resolución es obligatorio.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const solicitud = await solicitudAccesoExpedienteRepo.findById(solicitud_id);
        if (!solicitud) {
            const e = new Error("La solicitud no existe.");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (solicitud.estado_solicitud !== "PENDIENTE") {
            const e = new Error("La solicitud ya fue resuelta.");
            e.code = "STATE_ERROR";
            throw e;
        }

        const motivo = String(motivo_resolucion).trim();

        const updated = await solicitudAccesoExpedienteRepo.updateResolution({
            id: solicitud_id,
            estado_solicitud,
            motivo_resolucion: motivo,
            admin_responsable_id,
        });

        if (estado_solicitud === "APROBADA") {
            await pool.query(
                `
          INSERT INTO Permiso_Usuario_Expediente (
            usuario_id,
            expediente_id,
            permiso,
            motive,
            granted_by
          )
          VALUES (?, ?, 'VIEW', ?, ?)
          ON DUPLICATE KEY UPDATE
            motive = VALUES(motive),
            granted_by = VALUES(granted_by)
        `,
                [
                    solicitud.usuario_solicitante_id,
                    solicitud.expediente_id,
                    `Otorgado por aprobación de solicitud de acceso a expediente #${solicitud_id}`,
                    admin_responsable_id,
                ],
            );
        }

        await safeAudit({
            accion: "SOLICITUD_ACCESO_EXPEDIENTE_RESUELTA",
            resultado: estado_solicitud === "APROBADA" ? "PERMITIDO" : "DENEGADO",
            usuario_id: admin_responsable_id,
            detalle: {
                solicitud_id,
                expediente_id: solicitud.expediente_id,
                usuario_solicitante_id: solicitud.usuario_solicitante_id,
                estado_solicitud,
                motivo_resolucion: motivo,
            },
        });

        return await solicitudAccesoExpedienteRepo.findByIdDetailed(updated.id);
    },

    async listSolicitudes() {
        return await solicitudAccesoExpedienteRepo.listAll();
    },

    async listMisSolicitudes(usuarioId) {
        return await solicitudAccesoExpedienteRepo.listByUsuarioSolicitante(usuarioId);
    },

    async getSolicitudById(id) {
        const row = await solicitudAccesoExpedienteRepo.findByIdDetailed(id);
        if (!row) {
            const e = new Error("La solicitud no existe.");
            e.code = "NOT_FOUND";
            throw e;
        }
        return row;
    },
};
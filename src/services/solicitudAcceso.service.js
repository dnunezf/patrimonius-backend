import { solicitudAccesoRepo } from "../repositories/solicitudAccesoRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { pool } from "../db/pool.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";

async function safeAudit({
                             fecha,
                             accion,
                             resultado,
                             usuario_id,
                             documento_id,
                             detalle,
                         }) {
    try {
        const baseId = await bitacoraRepo.insertBase({
            fecha: fecha ?? new Date(),
            accion,
            resultado,
            usuario_id,
            documento_id: documento_id ?? null,
        });

        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: "OTRA",
            recurso: "SOLICITUD_ACCESO",
            parametros: JSON.stringify(detalle ?? {}),
        });

        return baseId;
    } catch (err) {
        console.warn("⚠️ Falló bitácora solicitud acceso:", err.message);
        return null;
    }
}

export const solicitudAccesoService = {
    async createSolicitud({ justificacion, usuario_solicitante_id, documento_id }) {
        if (!justificacion || !String(justificacion).trim()) {
            const e = new Error("La justificación es obligatoria.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe.");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (doc.estado !== "ARCHIVADO") {
            const e = new Error("Solo se pueden solicitar documentos archivados.");
            e.code = "STATE_ERROR";
            throw e;
        }

        const created = await solicitudAccesoRepo.create({
            justificacion: String(justificacion).trim(),
            usuario_solicitante_id,
            documento_id,
            estado_solicitud: "PENDIENTE",
        });

        await safeAudit({
            accion: "SOLICITUD_ACCESO_CREADA",
            resultado: "PERMITIDO",
            usuario_id: usuario_solicitante_id,
            documento_id,
            detalle: {
                solicitud_id: created.id,
                justificacion: created.justificacion,
                estado_solicitud: created.estado_solicitud,
            },
        });

        return await solicitudAccesoRepo.findByIdDetailed(created.id);
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

        const solicitud = await solicitudAccesoRepo.findById(solicitud_id);
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

        const updated = await solicitudAccesoRepo.updateResolution({
            id: solicitud_id,
            estado_solicitud,
            motivo_resolucion: motivo,
            admin_responsable_id,
        });

        if (estado_solicitud === "APROBADA") {
            await pool.query(
                `
                    INSERT INTO Permiso_Usuario (usuario_id, documento_id, permiso, motive)
                    VALUES (?, ?, 'VIEW', ?)
                        ON DUPLICATE KEY UPDATE
                                             motive = VALUES(motive)
                `,
                [
                    solicitud.usuario_solicitante_id,
                    solicitud.documento_id,
                    `Otorgado por aprobación de solicitud de acceso #${solicitud_id}`,
                ]
            );
        }

        const bitacoraId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion:
                estado_solicitud === "APROBADA"
                    ? "SOLICITUD_ACCESO_EXTERNO_APROBADA"
                    : "SOLICITUD_ACCESO_EXTERNO_RECHAZADA",
            resultado:
                estado_solicitud === "APROBADA" ? "PERMITIDO" : "DENEGADO",
            usuario_id: admin_responsable_id,
            documento_id: solicitud.documento_id,
        });

        await bitacoraRepo.insertActividad({
            id: bitacoraId,
            actividad: "OTRA",
            recurso: "SOLICITUD_ACCESO_EXTERNO",
            parametros: JSON.stringify({
                solicitud_id,
                estado_solicitud,
                motivo_resolucion: motivo,
                justificacion: solicitud.justificacion,
                usuario_solicitante_id: solicitud.usuario_solicitante_id,
                admin_responsable_id,
                documento_id: solicitud.documento_id,
            }),
        });

        return await solicitudAccesoRepo.findByIdDetailed(updated.id);
    },

    async getSolicitudById(id) {
        const solicitud = await solicitudAccesoRepo.findByIdDetailed(id);
        if (!solicitud) {
            const e = new Error("La solicitud no existe.");
            e.code = "NOT_FOUND";
            throw e;
        }
        return solicitud;
    },

    async listSolicitudes() {
        return solicitudAccesoRepo.listAll();
    },

    async listMisSolicitudes(usuarioId) {
        return solicitudAccesoRepo.listByUsuarioSolicitante(usuarioId);
    },
};
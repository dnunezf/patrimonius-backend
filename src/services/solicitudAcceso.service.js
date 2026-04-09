import { solicitudAccesoRepo } from "../repositories/solicitudAccesoRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { userRepo } from "../repositories/userRepo.js";
import { pool } from "../db/pool.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { bitacoraPermisosRepo } from "../repositories/bitacoraPermisosRepo.js";

/** Rol USUARIO_EXTERNO (seed / env). */
const ROL_ID_EXTERNO = Number(process.env.ROL_ID_EXTERNO) || 5;

/**
 * Solicitante “solo externo”: si tiene algún rol interno (≠ externo), se trata como EXCEPCION_ACCESO.
 */
function isSolicitanteUsuarioExternoPuro(userRow) {
    if (!userRow) return false;
    const rolIds = Array.isArray(userRow.rolIds)
        ? [...new Set(userRow.rolIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
        : [];
    if (rolIds.some((id) => id !== ROL_ID_EXTERNO)) return false;

    const primary = Number(userRow.rolId ?? 0);
    if (primary > 0 && primary !== ROL_ID_EXTERNO) return false;

    const r = String(userRow.rol || "")
        .toUpperCase()
        .replace(/\s+/g, "_");
    if (r === "USUARIO_EXTERNO" || r === "USUARIOEXTERNO") return true;

    const roles = userRow.roles;
    if (Array.isArray(roles)) {
        for (const x of roles) {
            const s = String(x || "")
                .toUpperCase()
                .replace(/\s+/g, "_");
            if (s.includes("EXTERNO")) return true;
        }
    }

    if (primary === ROL_ID_EXTERNO) return true;
    if (rolIds.length === 1 && rolIds[0] === ROL_ID_EXTERNO) return true;
    return false;
}

/** Columna Bitacora_Permisos.user_agent es VARCHAR(255). */
function normalizeUserAgent(ua) {
    if (ua == null) return null;
    const s = String(ua).trim();
    if (!s) return null;
    return s.length <= 255 ? s : s.slice(0, 255);
}

async function logResolucionBitacoraPermisos({
    solicitud_id,
    solicitud,
    admin_responsable_id,
    estado_solicitud,
    motivo,
    tipo_flujo,
    docSnapshot,
    user_agent,
}) {
    const sid = String(solicitud_id);
    const targetUid = Number(solicitud.usuario_solicitante_id);
    const docId = Number(solicitud.documento_id);
    const aprobada = estado_solicitud === "APROBADA";
    const estado_flujo = aprobada ? "APROBADA" : "DENEGADA";
    const permiso = aprobada ? "DESCARGA_DOCUMENTO_APROBADO" : "NINGUNO";

    const resultado = aprobada
        ? `Solicitud de acceso #${sid} aprobada (consulta/descarga). Usuario beneficiario: ${targetUid}. Documento: ${docId}.`
        : `Solicitud de acceso #${sid} rechazada. Usuario: ${targetUid}. Documento: ${docId}.`;

    try {
        await bitacoraPermisosRepo.log({
            actorUserId: admin_responsable_id,
            targetDocId: docId,
            permiso,
            accion: "SOLICITUD_ACCESO_RESOLUCION",
            solicitud_id: sid,
            target_usuario_id: targetUid,
            responsable_id: admin_responsable_id,
            tipo_flujo,
            estado_flujo,
            justificacion: solicitud.justificacion ?? null,
            user_agent: normalizeUserAgent(user_agent),
            detalle: {
                motivo_resolucion: motivo,
                permiso_efectivo_en_bd: aprobada ? "VIEW" : null,
                solicitud_id: Number(solicitud_id),
                estado_solicitud,
                documento_titulo: docSnapshot?.titulo ?? null,
                documento_codigo_unico: docSnapshot?.numero_serie ?? null,
            },
            resultado,
        });
    } catch (err) {
        console.warn("⚠️ Falló Bitacora_Permisos al resolver solicitud de acceso:", err.message);
    }
}

async function safeAudit({
                             fecha,
                             accion,
                             resultado,
                             usuario_id,
                             documento_id,
                             detalle,
                             recurso = "SOLICITUD_ACCESO",
                             recordActividadUsuario = true,
                         }) {
    try {
        const baseId = await bitacoraRepo.insertBase({
            fecha: fecha ?? new Date(),
            accion,
            resultado,
            usuario_id,
            documento_id: documento_id ?? null,
        });

        if (recordActividadUsuario) {
            await bitacoraRepo.insertActividad({
                id: baseId,
                actividad: "NAVEGACION",
                recurso,
                parametros: JSON.stringify(detalle ?? {}),
                accion,
            });
        }

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
            recordActividadUsuario: false,
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
                               user_agent = null,
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

        const solicitante = await userRepo.findById(solicitud.usuario_solicitante_id);
        const tipo_flujo = isSolicitanteUsuarioExternoPuro(solicitante)
            ? "SOLICITUD_ACCESO_EXTERNO"
            : "EXCEPCION_ACCESO";
        const docSnapshot = await documentoRepo.findById(solicitud.documento_id);

        await logResolucionBitacoraPermisos({
            solicitud_id,
            solicitud,
            admin_responsable_id,
            estado_solicitud,
            motivo,
            tipo_flujo,
            docSnapshot,
            user_agent,
        });

        const recursoActividad =
            tipo_flujo === "SOLICITUD_ACCESO_EXTERNO"
                ? "SOLICITUD_ACCESO_EXTERNO"
                : "SOLICITUD_ACCESO";
        await safeAudit({
            accion: "SOLICITUD_ACCESO_RESOLUCION",
            resultado: estado_solicitud === "APROBADA" ? "PERMITIDO" : "DENEGADO",
            usuario_id: admin_responsable_id,
            documento_id: solicitud.documento_id,
            recurso: recursoActividad,
            detalle: {
                solicitud_id: Number(solicitud_id),
                estado_solicitud,
                motivo_resolucion: motivo,
                tipo_flujo,
                usuario_solicitante_id: solicitud.usuario_solicitante_id,
            },
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
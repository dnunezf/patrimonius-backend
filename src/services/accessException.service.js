//src/services/accessException.service.js
import { randomUUID } from "node:crypto";
import { permissionExceptionRepo } from "../repositories/permissionExceptionRepo.js";
import { bitacoraPermisosRepo } from "../repositories/bitacoraPermisosRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";

const ALLOWED = new Set(["VIEW", "EDIT", "SIGN"]);

const TIPO_FLUJO = "EXCEPCION_ACCESO";

function normalizePerms(perms) {
    const safe = Array.isArray(perms) ? perms.filter((p) => ALLOWED.has(p)) : [];
    return Array.from(new Set(safe)).sort();
}

/** Una cadena para columna permiso: VIEW o VIEW,EDIT,SIGN */
function permisoCsv(perms) {
    const p = normalizePerms(perms);
    return p.length ? p.join(",") : "VIEW";
}

/** Snapshot para columna detalle (JSON): título y código único del documento al momento del evento. */
function detalleDocumentoSnapshot(doc) {
    if (!doc) {
        return {
            documento_titulo: null,
            documento_codigo_unico: null,
        };
    }
    return {
        documento_titulo: doc.titulo ?? null,
        documento_codigo_unico: doc.numero_serie ?? null,
    };
}

/**
 * Apply OK: lista de permisos (1 a 3); singular "Permiso" si solo hay uno, plural "Permisos" si hay varios.
 * Ej.: "Permiso VIEW asignado..." | "Permisos EDIT, VIEW asignados..."
 */
function resultadoAsignacionExcepcionOk(permisosNormalizados, targetUserId, documentId) {
    const arr =
        Array.isArray(permisosNormalizados) && permisosNormalizados.length
            ? permisosNormalizados
            : ["VIEW"];
    const lista = arr.join(", ");
    if (arr.length === 1) {
        return `Permiso ${lista} asignado al usuario con ID ${targetUserId} para el documento con ID ${documentId}.`;
    }
    return `Permisos ${lista} asignados al usuario con ID ${targetUserId} para el documento con ID ${documentId}.`;
}

function resultadoDenegacionAsignacion(targetUserId, documentId) {
    return `No se pudieron asignar los permisos al usuario con ID ${targetUserId} para el documento con ID ${documentId}.`;
}

function resultadoRevocacionExcepcion(targetUserId, documentId) {
    return `Permisos de excepción revocados al usuario con ID ${targetUserId} para el documento con ID ${documentId}.`;
}

function resultadoDenegacionRevocacion(targetUserId, documentId) {
    return `No se pudieron revocar los permisos de excepción del usuario con ID ${targetUserId} para el documento con ID ${documentId}.`;
}

export const accessExceptionService = {
    /** Apply (replace) exceptions for a user+document. Requires non-empty reason. */
    async apply({ userId, documentId, permissions, reason }, actor, req) {
        const perms = normalizePerms(permissions);
        if (!userId || !documentId) {
            const e = new Error("userId and documentId are required");
            e.code = 400;
            throw e;
        }
        if (!reason || !reason.trim()) {
            const e = new Error("reason is required");
            e.code = 400;
            throw e;
        }

        const responsableId = actor?.id ?? 0;
        const just = reason.trim();
        const now = new Date();
        const userAgent = req?.headers?.["user-agent"] ?? null;
        const docRow = await documentoRepo.findById(documentId);
        const detalleDoc = detalleDocumentoSnapshot(docRow);
        /** Mismo id en APPLY aprobado/denegado de este intento; enlaza trazas del mismo acto administrativo. */
        const solicitudId = randomUUID();
        const permisoColumna = permisoCsv(permissions);

        try {
            await permissionExceptionRepo.upsert(userId, documentId, perms, just);
        } catch (err) {
            await bitacoraPermisosRepo.log({
                actorUserId: responsableId,
                targetDocId: documentId,
                permiso: permisoColumna,
                accion: "EXCEPTION_APPLY",
                motive: just,
                scope: "documento",
                solicitud_id: solicitudId,
                target_usuario_id: userId,
                responsable_id: responsableId,
                tipo_flujo: TIPO_FLUJO,
                estado_flujo: "DENEGADA",
                justificacion: just,
                fecha_inicio_acceso: null,
                fecha_fin_acceso: null,
                user_agent: userAgent,
                detalle: { ...detalleDoc, error: String(err?.message || err) },
                resultado: resultadoDenegacionAsignacion(userId, documentId),
            });
            throw err;
        }

        await bitacoraPermisosRepo.log({
            actorUserId: responsableId,
            targetDocId: documentId,
            permiso: permisoColumna,
            accion: "EXCEPTION_APPLY",
            motive: just,
            scope: "documento",
            solicitud_id: solicitudId,
            target_usuario_id: userId,
            responsable_id: responsableId,
            tipo_flujo: TIPO_FLUJO,
            estado_flujo: "APROBADA",
            justificacion: just,
            fecha_inicio_acceso: now,
            fecha_fin_acceso: null,
            user_agent: userAgent,
            detalle: detalleDoc,
            resultado: resultadoAsignacionExcepcionOk(perms.length ? perms : ["VIEW"], userId, documentId),
        });

        return { userId, documentId, permissions: perms, solicitud_id: solicitudId };
    },

    async list({ page = 1, pageSize = 10, userId, categoriaId, estado, from, to }) {
        return permissionExceptionRepo.listPaged({ page, pageSize, userId, categoriaId, estado, from, to });
    },

    async remove({ userId, documentId, reason }, actor, req) {
        if (!userId || !documentId) {
            const e = new Error("userId and documentId are required");
            e.code = 400;
            throw e;
        }

        const responsableId = actor?.id ?? 0;
        const just = (reason || "").trim() || "remocion";
        const now = new Date();
        const userAgent = req?.headers?.["user-agent"] ?? null;
        const docRow = await documentoRepo.findById(documentId);
        const detalleDoc = detalleDocumentoSnapshot(docRow);
        const solicitudId =
            (await bitacoraPermisosRepo.findLastSolicitudIdExcepcion({
                targetUsuarioId: userId,
                documentoId: documentId,
            })) ?? null;

        try {
            await permissionExceptionRepo.remove(userId, documentId);
        } catch (err) {
            await bitacoraPermisosRepo.log({
                actorUserId: responsableId,
                targetDocId: documentId,
                permiso: "REVOCADA",
                accion: "EXCEPTION_REMOVE",
                motive: just,
                scope: "documento",
                solicitud_id: solicitudId,
                target_usuario_id: userId,
                responsable_id: responsableId,
                tipo_flujo: TIPO_FLUJO,
                estado_flujo: "DENEGADA",
                justificacion: just,
                fecha_inicio_acceso: null,
                fecha_fin_acceso: null,
                user_agent: userAgent,
                detalle: { ...detalleDoc, error: String(err?.message || err) },
                resultado: resultadoDenegacionRevocacion(userId, documentId),
            });
            throw err;
        }

        await bitacoraPermisosRepo.log({
            actorUserId: responsableId,
            targetDocId: documentId,
            permiso: "REVOCADA",
            accion: "EXCEPTION_REMOVE",
            motive: just,
            scope: "documento",
            solicitud_id: solicitudId,
            target_usuario_id: userId,
            responsable_id: responsableId,
            tipo_flujo: TIPO_FLUJO,
            estado_flujo: "REVOCADA",
            justificacion: just,
            fecha_inicio_acceso: null,
            fecha_fin_acceso: now,
            user_agent: userAgent,
            detalle: detalleDoc,
            resultado: resultadoRevocacionExcepcion(userId, documentId),
        });
    },
};

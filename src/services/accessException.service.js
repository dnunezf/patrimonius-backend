import { permissionExceptionRepo } from "../repositories/permissionExceptionRepo.js";
import { bitacoraPermisosRepo } from "../repositories/bitacoraPermisosRepo.js";

const ALLOWED = new Set(["VIEW", "EDIT", "SIGN"]);

function normalizePerms(perms) {
    const safe = Array.isArray(perms) ? perms.filter(p => ALLOWED.has(p)) : [];
    return Array.from(new Set(safe));
}

export const accessExceptionService = {
    /** Apply (replace) exceptions for a user+document. Requires non-empty reason. */
    async apply({ userId, documentId, permissions, reason }, actor) {
        const perms = normalizePerms(permissions);
        if (!userId || !documentId) {
            const e = new Error("userId and documentId are required");
            e.code = 400; throw e;
        }
        if (!reason || !reason.trim()) {
            const e = new Error("reason is required");
            e.code = 400; throw e;
        }

        await permissionExceptionRepo.upsert(userId, documentId, perms);

        // Audit one row per permission to satisfy NOT NULL constraint
        if (perms.length === 0) {
            // Interpret as cleared: still log with VIEW to record action footprint
            await bitacoraPermisosRepo.log({
                actorUserId: actor?.id ?? 0,
                targetDocId: documentId,
                permiso: "VIEW",
                accion: "EXCEPTION_APPLY",
                motive: reason.trim(),
                scope: "documento"
            });
        } else {
            for (const p of perms) {
                await bitacoraPermisosRepo.log({
                    actorUserId: actor?.id ?? 0,
                    targetDocId: documentId,
                    permiso: p,
                    accion: "EXCEPTION_APPLY",
                    motive: reason.trim(),
                    scope: "documento"
                });
            }
        }

        return { userId, documentId, permissions: perms };
    },

    async list() {
        return permissionExceptionRepo.list();
    },

    async remove({ userId, documentId, reason }, actor) {
        if (!userId || !documentId) {
            const e = new Error("userId and documentId are required");
            e.code = 400; throw e;
        }
        await permissionExceptionRepo.remove(userId, documentId);
        // Log removal once with VIEW token for footprint
        await bitacoraPermisosRepo.log({
            actorUserId: actor?.id ?? 0,
            targetDocId: documentId,
            permiso: "VIEW",
            accion: "EXCEPTION_REMOVE",
            motive: (reason || "").trim() || "remocion",
            scope: "documento"
        });
    }
};
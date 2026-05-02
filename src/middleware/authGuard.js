// src/middleware/authGuard.js
import jwt from "jsonwebtoken";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

/**
 * authGuard
 * - Verifies JWT (HS256) unless AUTH_DISABLED=true.
 * - Normalizes actor fields used across the system:
 *   - req.user: full payload + normalized rolId, role, unidadId, rolIds
 *   - req.actor: minimal identity used by services (id, email, isMaster, rolId, rolIds, unidadId)
 *
 * IMPORTANT (HU-002):
 * - Confidentiality checks require req.actor.rolIds (array of role IDs).
 * - This middleware guarantees req.actor.rolIds always exists as number[] (possibly empty).
 */
export async function authGuard(req, res, next) {
    const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

    const ip = req.ip;
    const userAgent = req.get("user-agent");

    // SYSTEM user id (seed)
    const systemId = Number(process.env.SYSTEM_USER_ID);
    if (!Number.isFinite(systemId)) {
        console.warn(
            "⚠️ SYSTEM_USER_ID is not set or invalid:",
            process.env.SYSTEM_USER_ID
        );
    }

    // =================== DEV / AUTH_DISABLED ===================
    if (SKIP_AUTH) {
        const actorId = Number.isFinite(systemId) ? systemId : 1;

        req.user = {
            id: actorId,
            email: "dev@local",
            role: "Administrador",
            rolId: 1,
            rolIds: [1],
            roles: ["ADMINISTRADOR"],
            unidadId: 1,
            isMaster: true,
        };

        req.actor = {
            id: actorId,
            email: "dev@local",
            isMaster: true,
            rolId: 1,
            rolIds: [1],
            role: "Administrador",
            roles: ["ADMINISTRADOR"],
            unidadId: 1,
        };

        return next();
    }

    // =================== JWT normal ===================
    const auth = req.headers.authorization || "";
    const [scheme, token] = auth.split(" ");

    if (!/^Bearer$/i.test(scheme) || !token) {
        // ✅ LOG: intento sin token
        try {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACCESO_NO_AUTORIZADO",
                result: "DENEGADO: missing_token",
                ip,
                userAgent,
                detail: {
                    path: req.originalUrl,
                    method: req.method,
                },
            });
        } catch (e) {
            // no bloqueamos la respuesta si falla el log
            console.error("bitacora logSecurityEvent error:", e);
        }

        return res.status(401).json({ error: "missing_token" });
    }

    try {
        const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });

        // Normalize single role
        const rolId = payload.rolId ?? payload.rol_id ?? null;
        const role = payload.role ?? payload.roleName ?? payload.rol ?? null;
        const unidadId = payload.unidadId ?? payload.unidad_id ?? null;

        // Normalize role IDs (N:M support)
        const rawRolIds =
            payload.rolIds ??
            payload.roleIds ??
            payload.rolesIds ??
            payload.usuarioRolIds ??
            payload.usuario_rol_ids ??
            null;

        let rolIds = [];
        if (Array.isArray(rawRolIds)) {
            rolIds = rawRolIds
                .map((n) => Number(n))
                .filter((n) => Number.isFinite(n) && n > 0);
        } else {
            // fallback: if only rolId exists, build array from it
            const single = Number(rolId);
            rolIds = Number.isFinite(single) && single > 0 ? [single] : [];
        }

        /**
         * El rol principal (`Usuario.rol_id`) no siempre está en `Usuario_Rol`.
         * Si el JWT trae `rolIds: []`, sin esto el actor pierde p. ej. ARCHIVADOR (3) en guards y HU-035.
         */
        const primaryRol = Number(rolId);
        if (Number.isFinite(primaryRol) && primaryRol > 0 && !rolIds.includes(primaryRol)) {
            rolIds.push(primaryRol);
        }

        // De-duplicate
        rolIds = Array.from(new Set(rolIds));

        /**
         * Identidad numérica estable: Bitacora_Base.usuario_id NOT NULL y FK a Usuario.
         * Varios emisores de JWT usan id, usuario_id, userId o sub.
         */
        const rawUserId =
            payload.id ??
            payload.usuario_id ??
            payload.userId ??
            payload.sub;
        const parsedUserId =
            rawUserId != null && rawUserId !== ""
                ? Number(rawUserId)
                : NaN;
        const hasPositiveUserId =
            Number.isInteger(parsedUserId) && parsedUserId > 0;

        let actorId;
        if (payload.isMaster === true) {
            actorId = Number.isFinite(systemId) && systemId > 0 ? systemId : hasPositiveUserId ? parsedUserId : null;
        } else {
            actorId = hasPositiveUserId ? parsedUserId : null;
        }

        if (actorId == null) {
            return res.status(401).json({
                error: "invalid_token",
                message: "Token sin identidad de usuario válida",
            });
        }

        // req.user: siempre incluye .id numérico (evita undefined en rutas que usan req.user.id)
        req.user = {
            ...payload,
            id: actorId,
            rolId,
            rolIds,
            role,
            unidadId,
        };

        // req.actor: minimal stable identity for services/auditing
        req.actor = {
            id: actorId,
            email: payload.email ?? null,
            isMaster: payload.isMaster ?? false,
            rolId,
            rolIds,
            role,
            roles: Array.isArray(payload.roles) ? payload.roles : [],
            unidadId,
        };

        return next();
    } catch (err) {
        // ✅ LOG: token invalido/expirado
        try {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACCESO_NO_AUTORIZADO",
                result: "DENEGADO: invalid_token",
                ip,
                userAgent,
                detail: {
                    path: req.originalUrl,
                    method: req.method,
                    // opcional: solo el mensaje, no stack
                    reason: String(err?.message || "jwt_verify_failed"),
                },
            });
        } catch (e) {
            console.error("bitacora logSecurityEvent error:", e);
        }

        return res.status(401).json({ error: "invalid_token" });
    }




}

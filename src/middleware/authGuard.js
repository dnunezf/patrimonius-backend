// src/middleware/authGuard.js
import jwt from "jsonwebtoken";

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
export function authGuard(req, res, next) {
  const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

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

    // In dev mode we behave as Admin with roleId=1.
    // Provide BOTH rolId and rolIds because downstream code expects rolIds.
    req.user = {
      id: actorId,
      email: "dev@local",
      role: "Administrador",
      rolId: 1,
      rolIds: [1],
      unidadId: 1,
      isMaster: true,
    };

    req.actor = {
      id: actorId,
      email: "dev@local",
      isMaster: true,
      rolId: 1,
      rolIds: [1],
      unidadId: 1,
    };

    return next();
  }

  // =================== JWT normal ===================
  const auth = req.headers.authorization || "";
  const [scheme, token] = auth.split(" ");

  if (!/^Bearer$/i.test(scheme) || !token) {
    return res.status(401).json({ error: "missing_token" });
  }

  try {
    const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });

    // Normalize single role
    const rolId = payload.rolId ?? payload.rol_id ?? null;
    const role = payload.role ?? payload.roleName ?? payload.rol ?? null;
    const unidadId = payload.unidadId ?? payload.unidad_id ?? null;

    // Normalize role IDs (N:M support)
    // Accept multiple possible token shapes: rolIds, roleIds, rolesIds, roles (numbers), usuarioRolIds...
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

    // De-duplicate
    rolIds = Array.from(new Set(rolIds));

    // Resolve actorId:
    // - if isMaster=true => map to SYSTEM_USER_ID (if available), else fallback to payload.id
    const rawId = payload.id ?? null;
    const actorId =
      payload.isMaster === true
        ? Number.isFinite(systemId)
          ? systemId
          : rawId
        : rawId;

    // req.user: keep payload but ensure normalized fields exist
    req.user = {
      ...payload,
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
      unidadId,
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

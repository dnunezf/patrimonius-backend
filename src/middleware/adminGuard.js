// ============================
// src/middleware/adminGuard.js
// (Add this file if you don't already have it.)
// ============================

/**
 * adminGuard
 * - Allows access for:
 *   - roleId === 1 (ADMINISTRADOR)
 *   - OR req.actor.isMaster === true
 */
export function adminGuard(req, res, next) {
  const actor = req.actor || req.user || null;

  if (!actor) return res.status(401).json({ error: "unauthorized" });

  const rolId = Number(actor.rolId ?? actor.rol_id ?? null);
  const isMaster = actor.isMaster === true;

  if (isMaster || rolId === 1) return next();

  return res.status(403).json({ error: "forbidden" });
}

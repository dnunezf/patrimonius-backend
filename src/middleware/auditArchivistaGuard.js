// src/middleware/auditArchivistaGuard.js
// Permite acceso al módulo de auditoría para:
// - ADMINISTRADOR (rolId === 1)
// - ARCHIVADOR/ARCHIVISTA (rolId === 3)
// - isMaster
// NO permite acceso a rutas de seguridad (eso lo maneja adminGuard)
export function auditArchivistaGuard(req, res, next) {
  const actor = req.actor || req.user || null;
  if (!actor) return res.status(401).json({ error: "unauthorized" });
  const rolId = Number(actor.rolId ?? actor.rol_id ?? null);
  const isMaster = actor.isMaster === true;
  if (isMaster || rolId === 1 || rolId === 3) return next();
  return res.status(403).json({ error: "forbidden" });
}

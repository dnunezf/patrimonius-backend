// src/middleware/archivoGuard.js
export function archivoGuard(req, res, next) {
    const actor = req.actor || req.user || null;
    if (!actor) return res.status(401).json({ error: "unauthorized" });

    const rolId = Number(actor.rolId ?? actor.rol_id ?? null);
    const isMaster = actor.isMaster === true;

    // ADMIN=1, ARCHIVADOR=3
    if (isMaster || rolId === 1 || rolId === 3) return next();

    return res.status(403).json({ error: "forbidden" });
}

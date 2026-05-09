import {
    isAdministratorActor,
    isEditorActor,
} from "../utils/roleAccess.util.js";

/**
 * Permite listar usuarios para el flujo de firmas (misma data que GET /admin/users, sin CRUD).
 */
export function signerUsersListGuard(req, res, next) {
    const actor = req.actor || req.user || null;
    if (!actor) return res.status(401).json({ error: "unauthorized" });
    if (isAdministratorActor(actor) || isEditorActor(actor)) return next();
    return res.status(403).json({ error: "forbidden" });
}

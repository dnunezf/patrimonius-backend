import { getDocumentsByUnit } from "../repositories/controlAcceso.repository.js";

/**
 * Devuelve los documentos accesibles para el usuario autenticado (req.user).
 */
export async function getAccessControl(user) {
    const userId = user.id ?? null;
    const userUnitId = user.unidadId ?? null;
    const userRolId = user.rolId ?? null;

    if (!userId || !userUnitId || !userRolId) {
        throw new Error("no_session");    }

    const documents = await getDocumentsByUnit(userId, userUnitId, userRolId);

    return {
        user,
        documents,
        accessibleCount: documents.filter(
            (d) => d.canView || d.canEdit || d.canSign
        ).length,
    };
}

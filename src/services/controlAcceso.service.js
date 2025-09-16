import { getDocumentsByUnit } from "../repositories/controlAcceso.repository.js";

export async function getAccessControl(user) {
    const userId = user.id ?? user.userId ?? null;
    const userUnitId = user.unidadId ?? user.unidad_id ?? null;
    const userRolId = user.rolId ?? user.rol_id ?? null;

    if (!userId || !userUnitId || !userRolId) {
        throw new Error("Usuario no tiene id, unidad o rol asignado en el token");
    }

    const documents = await getDocumentsByUnit(userId, userUnitId, userRolId);

    return {
        user,
        documents,
        accessibleCount: documents.filter(
            (d) => d.canView || d.canEdit || d.canSign
        ).length,
    };
}

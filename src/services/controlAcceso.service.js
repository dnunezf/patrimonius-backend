import { getDocumentsByUnit } from "../repositories/controlAcceso.repository.js";

/**
 * Servicio de Control de Acceso (HU-003)
 * Integra:
 * - HU-001 → Roles personalizados
 * - HU-004 → Aplicación de permisos por rol
 * - HU-005 → Reglas de acceso excepcionales
 * - HU-003 → Acceso por unidad organizacional
 */
export async function getAccessControl(user) {
    const userId = user.id ?? user.userId ?? null;
    const userUnitId = user.unidadId ?? user.unidad_id ?? null;
    const userRolId = user.rolId ?? user.rol_id ?? null;

    if (!userId || !userUnitId || !userRolId) {
        throw new Error("Usuario no tiene id, unidad o rol asignado en el token");
    }

    // 1️⃣ Obtener la matriz de permisos por documento
    const documents = await getDocumentsByUnit(userId, userUnitId, userRolId);

    // 2️⃣ Enriquecer resultado con origen del permiso
    const enrichedDocs = documents.map(doc => {
        let source = "DENEGADO";

        // a. Acceso por unidad (HU-003)
        if (doc.unitId === userUnitId && (doc.canView || doc.canEdit || doc.canSign)) {
            source = "UNIDAD ORGANIZACIONAL";
        }

        // b. Acceso por excepción (HU-005)
        else if (!doc.unitId === userUnitId && (doc.canView || doc.canEdit || doc.canSign)) {
            source = "EXCEPCIÓN AUTORIZADA";
        }

        // c. Acceso por rol o permiso directo (HU-001 / HU-004)
        else if (doc.canView || doc.canEdit || doc.canSign) {
            source = "PERMISO DE ROL / USUARIO";
        }

        return { ...doc, source };
    });

    // 3️⃣ Contar accesos efectivos
    const accessibleCount = enrichedDocs.filter(
        (d) => d.canView || d.canEdit || d.canSign
    ).length;

    // 4️⃣ Devolver estructura completa
    return {
        user,
        documents: enrichedDocs,
        accessibleCount,
    };
}

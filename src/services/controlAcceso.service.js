//src/services/controlAcceso.service
import { pool } from "../db/pool.js";
import { getDocumentsByUnit } from "../repositories/controlAcceso.repository.js";

export async function getAccessControl(user) {
    const userId = user.id ?? user.userId ?? null;
    const userUnitId = user.unidadId ?? user.unidad_id ?? null;
    const userRolId = user.rolId ?? user.rol_id ?? null;

    if (!userId || !userUnitId || !userRolId) {
        throw new Error("Usuario no tiene id, unidad o rol asignado en el token");
    }

    // 1️⃣ Obtener matriz de permisos
    const documents = await getDocumentsByUnit(userId, userUnitId, userRolId);

    // 2️⃣ Obtener info adicional del usuario (unidad + roles)
    const [[unidadRow]] = await pool.execute(
        `SELECT nombre FROM Unidad_Organizacional WHERE id = ?`,
        [userUnitId]
    );

    const [rolesRows] = await pool.execute(
        `SELECT r.nombre FROM Rol r
     JOIN Usuario_Rol ur ON ur.rol_id = r.id
     WHERE ur.usuario_id = ?`,
        [userId]
    );

    const roles = rolesRows.length
        ? rolesRows.map((r) => r.nombre)
        : [user.role || "Sin rol asignado"];

    const unidadNombre = unidadRow?.nombre ?? "Sin unidad asignada";

    // 3️⃣ Enriquecer documentos (como ya tenías)
    const enrichedDocs = documents.map((doc) => {
        let source = "DENEGADO";
        if (doc.unitId === userUnitId && (doc.canView || doc.canEdit || doc.canSign))
            source = "UNIDAD ORGANIZACIONAL";
        else if (!doc.unitId === userUnitId && (doc.canView || doc.canEdit || doc.canSign))
            source = "EXCEPCIÓN AUTORIZADA";
        else if (doc.canView || doc.canEdit || doc.canSign)
            source = "PERMISO DE ROL / USUARIO";
        return { ...doc, source };
    });

    const accessibleCount = enrichedDocs.filter(
        (d) => d.canView || d.canEdit || d.canSign
    ).length;

    // 4️⃣ Retornar con datos de usuario completos
    return {
        user: {
            id: userId,
            email: user.email,
            roles,
            unidad: unidadNombre,
        },
        documents: enrichedDocs,
        accessibleCount,
    };
}

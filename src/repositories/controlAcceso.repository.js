import { pool } from "../db/pool.js";

/**
 * Retorna documentos con flags de acceso según unidad, rol y excepciones.
 * @param {number} userId - ID del usuario autenticado
 * @param {number} userUnitId - ID de la unidad del usuario autenticado
 * @param {number} userRolId - ID del rol del usuario autenticado
 */
export async function getDocumentsByUnit(userId, userUnitId, userRolId) {
    // 1. Traer documentos con unidad responsable
    const [docs] = await pool.execute(
        `
            SELECT
                d.id           AS id,
                d.numero_serie AS code,
                d.titulo       AS title,
                u.nombre       AS unit,
                d.estado       AS status,
                u.id           AS unitId
            FROM Documento d
                     JOIN Unidad_Organizacional u ON d.unidad_id = u.id
        `
    );

    // 2. Excepciones específicas por usuario
    const [userPerms] = await pool.execute(
        `SELECT documento_id, permiso FROM Permiso_Usuario WHERE usuario_id = ?`,
        [userId]
    );

    // 3. Excepciones Documento_Allowed_User
    const [allowedUsers] = await pool.execute(
        `SELECT documento_id, actions FROM Documento_Allowed_User WHERE usuario_id = ?`,
        [userId]
    );

    // 4. Excepciones Documento_Allowed_Rol
    const [allowedRoles] = await pool.execute(
        `SELECT documento_id, actions FROM Documento_Allowed_Rol WHERE rol_id = ?`,
        [userRolId]
    );

    // 5. Procesar permisos
    return docs.map((doc) => {
        const sameUnit = doc.unitId === userUnitId;

        // permisos base (unidad)
        let perms = {
            canView: sameUnit,
            canEdit: sameUnit && doc.status !== "ARCHIVADO",
            canSign: sameUnit && doc.status === "FIRMA",
        };

        // 🚀 aplicar Permiso_Usuario (si hay overrides)
        const userP = userPerms.filter((p) => p.documento_id === doc.id).map((p) => p.permiso);
        if (userP.length) {
            perms = {
                canView: userP.includes("VIEW"),
                canEdit: userP.includes("EDIT"),
                canSign: userP.includes("SIGN"),
            };
        }

        // 🚀 aplicar Documento_Allowed_User (si existe)
        const au = allowedUsers.find((a) => a.documento_id === doc.id);
        if (au) {
            const acts = au.actions.split(",");
            perms = {
                canView: acts.includes("VIEW"),
                canEdit: acts.includes("EDIT"),
                canSign: acts.includes("SIGN"),
            };
        }

        // 🚀 aplicar Documento_Allowed_Rol (solo si no hay override de usuario o de allowedUser)
        if (!userP.length && !au) {
            const ar = allowedRoles.find((a) => a.documento_id === doc.id);
            if (ar) {
                const acts = ar.actions.split(",");
                perms = {
                    canView: acts.includes("VIEW"),
                    canEdit: acts.includes("EDIT"),
                    canSign: acts.includes("SIGN"),
                };
            }
        }

        return { ...doc, ...perms };
    });
}

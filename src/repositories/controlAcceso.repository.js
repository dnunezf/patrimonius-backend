//src/repositories/controlAcceso.repository.js
import { pool } from "../db/pool.js";

/**
 * Control de Acceso por Unidad Organizacional (HU-003)
 * Integración con HU-001 (usuarios y roles),
 * HU-004 (permisos por rol) y HU-005 (excepciones en Permiso_Usuario).
 */
export async function getDocumentsByUnit(userId, userUnitId, userRolId) {
    // 1️⃣ Obtener todos los documentos con su unidad responsable
    const [docs] = await pool.execute(`
        SELECT
            d.id           AS id,
            d.numero_serie AS code,
            d.titulo       AS title,
            u.nombre       AS unit,
            d.estado       AS status,
            u.id           AS unitId
        FROM Documento d
                 JOIN Unidad_Organizacional u ON d.unidad_id = u.id
    `);

    // 2️⃣ Excepciones específicas (HU-005)
    const [userPerms] = await pool.execute(`
        SELECT documento_id, permiso
        FROM Permiso_Usuario
        WHERE usuario_id = ?
    `, [userId]);

    // 3️⃣ Permisos explícitos por usuario/documento (HU-002)
    const [allowedUsers] = await pool.execute(`
        SELECT documento_id, actions
        FROM Documento_Allowed_User
        WHERE usuario_id = ?
    `, [userId]);

    // 4️⃣ Permisos por rol (HU-004)
    const [allowedRoles] = await pool.execute(`
        SELECT documento_id, actions
        FROM Documento_Allowed_Rol
        WHERE rol_id = ?
    `, [userRolId]);

    // 5️⃣ Aplicar jerarquía de permisos
    const result = [];
    for (const doc of docs) {
        const sameUnit = doc.unitId === userUnitId;

        // 🔹 Permisos base (unidad)
        let perms = {
            canView: sameUnit,
            canEdit: sameUnit && doc.status !== "ARCHIVADO",
            canSign: sameUnit && doc.status === "FIRMA",
        };

        // 🔹 HU-005: Permisos excepcionales individuales
        const userP = userPerms
            .filter(p => p.documento_id === doc.id)
            .map(p => p.permiso);
        if (userP.length) {
            perms = {
                canView: userP.includes("VIEW"),
                canEdit: userP.includes("EDIT"),
                canSign: userP.includes("SIGN"),
            };
        }

        // 🔹 HU-002: Permisos explícitos por usuario/documento
        const au = allowedUsers.find(a => a.documento_id === doc.id);
        if (au) {
            const acts = String(au.actions).split(",");
            perms = {
                canView: acts.includes("VIEW"),
                canEdit: acts.includes("EDIT"),
                canSign: acts.includes("SIGN"),
            };
        }

        // 🔹 HU-004: Permisos heredados por rol (si no hay overrides previos)
        if (!userP.length && !au) {
            const ar = allowedRoles.find(a => a.documento_id === doc.id);
            if (ar) {
                const acts = String(ar.actions).split(",");
                perms = {
                    canView: acts.includes("VIEW"),
                    canEdit: acts.includes("EDIT"),
                    canSign: acts.includes("SIGN"),
                };
            }
        }

        // 🔹 Registrar accesos denegados (criterio de aceptación)
        if (!perms.canView && !perms.canEdit && !perms.canSign && !sameUnit) {
            try {
                await pool.execute(`
                    INSERT INTO Bitacora_Permisos (usuario_id, documento_id, accion, resultado, permiso)
                    VALUES (?, ?, 'ACCESS_CHECK', 'DENIED', 'SIN_PERMISOS')
                `, [userId, doc.id]);
            } catch (e) {
                console.error("⚠ Error registrando bitácora de acceso:", e.message);
            }
        }

        result.push({ ...doc, ...perms });
    }

    return result;
}

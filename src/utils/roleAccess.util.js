/**
 * Criterios de rol para middleware (admin vs gestión documental / archivístico).
 * IDs por defecto alineados con `bd_patrimonius.sql`: 1=ADMINISTRADOR, 3=ARCHIVADOR.
 */
const ROL_ID_ADMIN = Number(process.env.ROL_ID_ADMIN) || 1;
const ROL_ID_ARCHIVADOR = Number(process.env.ROL_ID_ARCHIVADOR) || 3;

function normalizeRoleName(s) {
    return String(s || "")
        .toUpperCase()
        .replace(/\s+/g, "_")
        .trim();
}

function roleNameIsAdmin(name) {
    const r = normalizeRoleName(name);
    return r === "ADMINISTRADOR" || r === "ADMIN";
}

function roleNameIsArchivist(name) {
    const r = normalizeRoleName(name);
    return r === "ARCHIVADOR" || r === "ARCHIVISTA";
}

/**
 * Solo administrador (usuarios, roles HU de seguridad, confidencialidad global, /audit, etc.).
 */
export function isAdministratorActor(actor) {
    if (!actor) return false;
    if (actor.isMaster === true) return true;

    const primary = Number(actor.rolId ?? actor.rol_id ?? 0);
    if (primary === ROL_ID_ADMIN) return true;

    const r = normalizeRoleName(actor.role ?? actor.rol ?? actor.roleName);
    if (roleNameIsAdmin(r)) return true;

    const rolIds = Array.isArray(actor.rolIds)
        ? actor.rolIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
    if (rolIds.includes(ROL_ID_ADMIN)) return true;

    const roles = actor.roles;
    if (Array.isArray(roles)) {
        for (const x of roles) {
            if (roleNameIsAdmin(x)) return true;
        }
    }

    return false;
}

/**
 * Administrador o personal de archivo (gestión documental: series, expedientes, conservación HU-035).
 */
export function isAdminOrArchivistActor(actor) {
    if (isAdministratorActor(actor)) return true;

    const primary = Number(actor.rolId ?? actor.rol_id ?? 0);
    if (primary === ROL_ID_ARCHIVADOR) return true;

    const rolIds = Array.isArray(actor.rolIds)
        ? actor.rolIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
    if (rolIds.includes(ROL_ID_ARCHIVADOR)) return true;

    const r = normalizeRoleName(actor.role ?? actor.rol ?? actor.roleName);
    if (roleNameIsArchivist(r)) return true;

    const roles = actor.roles;
    if (Array.isArray(roles)) {
        for (const x of roles) {
            if (roleNameIsArchivist(x)) return true;
        }
    }

    return false;
}

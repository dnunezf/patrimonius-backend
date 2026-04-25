/**
 * Usuario con visión global en módulos de consulta (HU-025 / expedientes).
 * Usa el rol principal del JWT (`rolId` / `Usuario.rol_id`), no la mera presencia
 * de ADMIN en `Usuario_Rol`, para no saltar el filtro por unidad por multi-rol.
 */
const ROL_ID_ADMIN = Number(process.env.ROL_ID_ADMIN) || 1;

export function isConsultaMasterUser(user) {
    if (user?.isMaster === true) return true;
    const primary = Number(user?.rolId ?? user?.rol_id ?? 0);
    if (primary === ROL_ID_ADMIN) return true;
    const r = String(user?.role || "")
        .toUpperCase()
        .replace(/\s+/g, "_");
    if (r === "ADMINISTRADOR" || r === "ADMIN") return true;
    return false;
}

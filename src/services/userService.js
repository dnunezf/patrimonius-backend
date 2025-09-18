import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

const EDITOR_ID = 2; // must match DB + frontend

function normalizeEditorPerms(input) {
  const raw = input?.editorPermissions ?? input?.permisosEditor ?? [];
  const allowed = new Set(["EDIT", "SIGN"]);
  return Array.from(
    new Set((Array.isArray(raw) ? raw : []).filter((p) => allowed.has(p)))
  );
}

async function safeAudit(payload) {
  try {
    await logAdminAction(payload);
  } catch (_) {}
}

export const userService = {
  /** Create with multi-role support. */
  async create(data, actor) {
    // Primary role = first in the list (validator guarantees both rolId & rolIds)
    const created = await userRepo.create({
      nombre: data.nombre,
      apellido1: data.apellido1,
      apellido2: data.apellido2 ?? "",
      email: data.email,
      rolId: data.rolId,
      unidadId: data.unidadId,
    });

    // Sync pivot table with all roles (including the primary one)
    await userRepo.setRoles(created.id, data.rolIds ?? [data.rolId]);

    // Assign editor perms if ANY selected role is EDITOR
    const hasEditor = (data.rolIds ?? [data.rolId]).includes(EDITOR_ID);
    const perms = hasEditor ? normalizeEditorPerms(data) : [];
    await permRepo.setForUser(created.id, perms);

    await safeAudit({
      actorId: actor?.id ?? null,
      action: "USER_CREATE",
      result: "OK",
      detail: {
        userId: created.id,
        rolIds: data.rolIds ?? [data.rolId],
        perms,
      },
    });

    const applied = await permRepo.getForUser(created.id);
    return { ...created, editorPermissions: applied, permisosEditor: applied };
  },

  async list() {
    return userRepo.findAll();
  },

  async search(searchTerm) {
    return searchTerm ? userRepo.search(searchTerm) : userRepo.findAll();
  },

  /** Update basic fields + multi-role sync when provided. */
  async update(id, patch, actor) {
    const map = {};
    if (patch.nombre !== undefined) map.nombre = patch.nombre;
    if (patch.apellido1 !== undefined) map.apellido1 = patch.apellido1;
    if (patch.apellido2 !== undefined) map.apellido2 = patch.apellido2;
    if (patch.email !== undefined) map.email = patch.email;

    // If rolIds provided, take first as primary; else allow legacy rolId
    const incomingIds = Array.isArray(patch.rolIds)
      ? patch.rolIds.map(Number)
      : undefined;
    if (incomingIds?.length) map.rol_id = incomingIds[0];
    else if (patch.rolId !== undefined) map.rol_id = patch.rolId;

    if (patch.unidadId !== undefined) map.unidad_id = patch.unidadId;

    const updated = await userRepo.update(id, map);
    if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

    // Sync pivot roles if provided
    if (incomingIds?.length) {
      await userRepo.setRoles(id, incomingIds);
    }

    // Re-apply editor perms if roles/perms changed
    if (
      incomingIds?.length ||
      patch.rolId !== undefined ||
      patch.editorPermissions !== undefined ||
      patch.permisosEditor !== undefined
    ) {
      const currentRoles = incomingIds?.length
        ? incomingIds
        : updated.rolIds?.length
        ? updated.rolIds
        : [updated.rolId];
      const hasEditor = currentRoles.includes(EDITOR_ID);
      const perms = hasEditor ? normalizeEditorPerms(patch) : [];
      await permRepo.setForUser(id, perms);
    }

    await safeAudit({
      actorId: actor?.id ?? null,
      action: "USER_UPDATE",
      result: "OK",
      detail: { userId: id, patch },
    });

    const applied = await permRepo.getForUser(id);
    return { ...updated, editorPermissions: applied, permisosEditor: applied };
  },

  async remove(id, actor) {
    await userRepo.remove(id);
    await safeAudit({
      actorId: actor?.id ?? null,
      action: "USER_DELETE",
      result: "OK",
      detail: { userId: id },
    });
  },
};

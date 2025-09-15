import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permRepo.js"; // keep canonical name
import { logAdminAction } from "../repositories/bitacoraRepo.js";

const EDITOR_ID = 2; // must match DB and frontend

/** Normalize editor permissions from either DTO shape. */
function normalizeEditorPerms(input) {
  const raw = input?.editorPermissions ?? input?.permisosEditor ?? [];
  const allowed = new Set(["EDIT", "SIGN"]);
  return Array.from(
    new Set((Array.isArray(raw) ? raw : []).filter((p) => allowed.has(p)))
  );
}

/** Core user management for HU-001. */
export const userService = {
  /** Create a user and optional editor permissions. */
  async create(data, actor) {
    const created = await userRepo.create({
      nombre: data.nombre,
      apellido1: data.apellido1,
      apellido2: data.apellido2 ?? "",
      email: data.email,
      rolId: data.rolId,
      unidadId: data.unidadId,
    });

    // Apply editor permissions only if role is EDITOR_ID
    const perms = data.rolId === EDITOR_ID ? normalizeEditorPerms(data) : [];
    await permRepo.setForUser(created.id, perms);

    await logAdminAction({
      actorId: actor?.id ?? null,
      action: "USER_CREATE",
      result: "OK",
      detail: { userId: created.id, rolId: data.rolId, perms },
    });

    const applied = await permRepo.getForUser(created.id);
    created.editorPermissions = applied;
    created.permisosEditor = applied;
    return created;
  },

  /** List users for admin table. */
  async list() {
    return userRepo.findAll();
  },

  /** Patch user and re-apply permissions if role or perms changed. */
  async update(id, patch, actor) {
    // Build partial update map (DB column names)
    const map = {};
    if (patch.nombre !== undefined) map.nombre = patch.nombre;
    if (patch.apellido1 !== undefined) map.apellido1 = patch.apellido1;
    if (patch.apellido2 !== undefined) map.apellido2 = patch.apellido2;
    if (patch.email !== undefined) map.email = patch.email;
    if (patch.rolId !== undefined) map.rol_id = patch.rolId;
    if (patch.unidadId !== undefined) map.unidad_id = patch.unidadId;

    const updated = await userRepo.update(id, map);
    if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

    // Decide current role id robustly (supports alias or raw column)
    const currentRolId = patch.rolId ?? updated.rolId ?? updated.rol_id;

    // Re-apply editor perms only when relevant fields are present
    if (
      patch.rolId !== undefined ||
      patch.editorPermissions !== undefined ||
      patch.permisosEditor !== undefined
    ) {
      const perms =
        currentRolId === EDITOR_ID ? normalizeEditorPerms(patch) : [];
      await permRepo.setForUser(id, perms);
    }

    // Audit
    await logAdminAction({
      actorId: actor?.id ?? null,
      action: "USER_UPDATE",
      result: "OK",
      detail: { userId: id, patch },
    });

    const applied = await permRepo.getForUser(id);
    updated.editorPermissions = applied;
    updated.permisosEditor = applied;
    return updated;
  },

  /** Delete user and audit. */
  async remove(id, actor) {
    await userRepo.remove(id);
    await logAdminAction({
      actorId: actor?.id ?? null,
      action: "USER_DELETE",
      result: "OK",
      detail: { userId: id },
    });
  },

  /** List users with optional search by name or email */
  async search(searchTerm) {
    if (searchTerm) {
      return userRepo.search(searchTerm); // Call search method in the repository
    }
    return userRepo.findAll(); // If no search term, fetch all users
  },
};

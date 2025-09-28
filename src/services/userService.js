import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

const EDITOR_ID = 2; // Role ID for "Editor", must match DB and frontend

/**
 * Normalize editor permissions array.
 * Ensures only valid values ("EDIT" or "SIGN") are stored.
 * Accepts both "editorPermissions" or "permisosEditor" from input.
 */
function normalizeEditorPerms(input) {
  const raw = input?.editorPermissions ?? input?.permisosEditor ?? [];
  const allowed = new Set(["EDIT", "SIGN"]);
  return Array.from(
    new Set((Array.isArray(raw) ? raw : []).filter((p) => allowed.has(p)))
  );
}

/**
 * Helper wrapper around logAdminAction.
 * Ensures that logging errors (foreign key, connectivity, etc.)
 * do not propagate and break main user operations.
 */
async function safeAudit(payload) {
  try {
    await logAdminAction(payload);
  } catch (_) {
    // Intentionally ignored, prevents UX disruptions when audit fails
  }
}

/**
 * Core user management service for HU-001.
 * Encapsulates creation, update, deletion, listing, and search logic
 * with optional editor permissions and auditing.
 */
export const userService = {
  /**
   * Create a new user with optional editor permissions.
   * - Inserts into Usuario table.
   * - Applies editor permissions if role = EDITOR_ID.
   * - Logs action in audit trail (safe).
   */
  async create(data, actor) {
    const created = await userRepo.create({
      nombre: data.nombre,
      apellido1: data.apellido1,
      apellido2: data.apellido2 ?? "",
      email: data.email,
      rolId: data.rolId,
      unidadId: data.unidadId,
    });

    // Only assign editor permissions when role is EDITOR
    const perms = data.rolId === EDITOR_ID ? normalizeEditorPerms(data) : [];
    await permRepo.setForUser(created.id, perms);

    // Log action (safe, will not break UX on failure)
    await safeAudit({
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

  /**
   * Get full user list with roles and units.
   * Used in admin dashboard and user management screen.
   */
  async list() {
    return userRepo.findAll();
  },

  /**
   * Search users by name or email.
   * Returns either filtered or all users if no term is provided.
   */
  async search(searchTerm) {
    return searchTerm ? userRepo.search(searchTerm) : userRepo.findAll();
  },

  /**
   * Update user attributes and re-apply editor permissions if necessary.
   * - Updates DB fields selectively.
   * - If role or permissions changed, re-sync Permiso_Usuario.
   * - Always logs update action safely.
   */
  async update(id, patch, actor) {
    const map = {};
    if (patch.nombre !== undefined) map.nombre = patch.nombre;
    if (patch.apellido1 !== undefined) map.apellido1 = patch.apellido1;
    if (patch.apellido2 !== undefined) map.apellido2 = patch.apellido2;
    if (patch.email !== undefined) map.email = patch.email;
    if (patch.rolId !== undefined) map.rol_id = patch.rolId;
    if (patch.unidadId !== undefined) map.unidad_id = patch.unidadId;

    const updated = await userRepo.update(id, map);
    if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

    // Decide which role ID to use (from patch or DB)
    const currentRolId = patch.rolId ?? updated.rolId ?? updated.rol_id;

    // Only re-apply editor permissions when role/perms changed
    if (
      patch.rolId !== undefined ||
      patch.editorPermissions !== undefined ||
      patch.permisosEditor !== undefined
    ) {
      const perms =
        currentRolId === EDITOR_ID ? normalizeEditorPerms(patch) : [];
      await permRepo.setForUser(id, perms);
    }

    // Audit update safely
    await safeAudit({
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

  /**
   * Delete user by ID.
   * - Removes record from Usuario.
   * - Logs action safely.
   */
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

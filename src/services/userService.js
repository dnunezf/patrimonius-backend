import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

const EDITOR_ID = 2; // Adjust if it changes in the DB

/** Core user management for HU-001. */
export const userService = {
  async create(data, actor) {
    const created = await userRepo.create({
      nombre: data.nombre,
      apellido1: data.apellido1,
      apellido2: data.apellido2 ?? "",
      email: data.email,
      rolId: data.rolId,
      unidadId: data.unidadId,
    });

    const perms = data.rolId === EDITOR_ID ? data.editorPermissions || [] : [];
    await permRepo.setForUser(created.id, perms);

    await logAdminAction({
      actorId: actor?.id ?? null,
      action: "USER_CREATE",
      result: "OK",
      detail: { userId: created.id, rolId: data.rolId, perms },
    });

    created.editorPermissions = await permRepo.getForUser(created.id);
    return created;
  },

  async list() {
    return userRepo.findAll();
  },

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

    if (patch.rolId !== undefined || patch.editorPermissions !== undefined) {
      const rolId = patch.rolId ?? updated.rolId;
      const perms = rolId === EDITOR_ID ? patch.editorPermissions || [] : [];
      await permRepo.setForUser(id, perms);
    }

    await logAdminAction({
      actorId: actor?.id ?? null,
      action: "USER_UPDATE",
      result: "OK",
      detail: { userId: id, patch },
    });

    updated.editorPermissions = await permRepo.getForUser(id);
    return updated;
  },

  async remove(id, actor) {
    await userRepo.remove(id);
    await logAdminAction({
      actorId: actor?.id ?? null,
      action: "USER_DELETE",
      result: "OK",
      detail: { userId: id },
    });
  },
};

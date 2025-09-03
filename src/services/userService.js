import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

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
    if (data.rolId && data.editorPermissions?.length) {
      await permRepo.setForUser(created.id, data.editorPermissions);
    }
    await logAdminAction({
      actorId: actor.id,
      action: "USER_CREATE",
      result: "OK",
      detail: {
        userId: created.id,
        rolId: data.rolId,
        perms: data.editorPermissions || [],
      },
    });
    created.editorPermissions = await permRepo.getForUser(created.id);
    return created;
  },

  async list() {
    return userRepo.findAll();
  },

  async update(id, patch, actor) {
    const allowed = [
      "nombre",
      "apellido1",
      "apellido2",
      "email",
      "rol_id",
      "unidad_id",
    ];
    const map = {};
    if (patch.nombre) map.nombre = patch.nombre;
    if (patch.apellido1) map.apellido1 = patch.apellido1;
    if (patch.apellido2 !== undefined) map.apellido2 = patch.apellido2;
    if (patch.email) map.email = patch.email;
    if (patch.rolId) map.rol_id = patch.rolId;
    if (patch.unidadId) map.unidad_id = patch.unidadId;

    const updated = await userRepo.update(id, map);
    if (!updated) throw Object.assign(new Error("not found"), { code: 404 });
    if (patch.editorPermissions)
      await permRepo.setForUser(id, patch.editorPermissions);

    await logAdminAction({
      actorId: actor.id,
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
      actorId: actor.id,
      action: "USER_DELETE",
      result: "OK",
      detail: { userId: id },
    });
  },
};

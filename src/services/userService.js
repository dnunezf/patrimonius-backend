import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

const EDITOR_ID = 2; // Debe coincidir con el ID de rol "EDITOR" en la BD

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
  /** Crear usuario con roles múltiples y activación */
  async create(data, actor) {
    // Crear usuario base
    const created = await userRepo.create({
      nombre: data.nombre,
      apellido1: data.apellido1,
      apellido2: data.apellido2 ?? "",
      email: data.email,
      rolId: data.rolId,
      unidadId: data.unidadId,
    });

    // Sincronizar tabla de roles
    await userRepo.setRoles(created.id, data.rolIds ?? [data.rolId]);

    // Evaluar si es rol EDITOR
    const hasEditor = (data.rolIds ?? [data.rolId]).includes(EDITOR_ID);
    const perms = hasEditor ? normalizeEditorPerms(data) : [];

    // 👇 Bloque protegido para permisos
    try {
      if (permRepo?.setForUser && typeof permRepo.setForUser === "function") {
        await permRepo.setForUser(created.id, perms);
      } else {
        console.warn(
          "[WARN] permRepo.setForUser no está definido. Se omite asignación de permisos."
        );
      }
    } catch (err) {
      console.error("[ERROR] Fallo al asignar permisos:", err.message);
    }

    // Bitácora
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

    // Intentar recuperar permisos aplicados
    let applied = [];
    try {
      if (permRepo?.getForUser && typeof permRepo.getForUser === "function") {
        applied = await permRepo.getForUser(created.id);
      }
    } catch (err) {
      console.warn("[WARN] No se pudieron recuperar permisos:", err.message);
    }

    // Usuario completo
    const hydrated = await userRepo.findById(created.id);
    return { ...hydrated, editorPermissions: applied, permisosEditor: applied };
  },

  /** Listado completo de usuarios */
  async list() {
    return userRepo.findAll();
  },

  /** Buscar usuarios por término */
  async search(searchTerm) {
    return searchTerm ? userRepo.search(searchTerm) : userRepo.findAll();
  },

  /** Actualizar usuario con roles y permisos */
  async update(id, patch, actor) {
    const map = {};
    if (patch.nombre !== undefined) map.nombre = patch.nombre;
    if (patch.apellido1 !== undefined) map.apellido1 = patch.apellido1;
    if (patch.apellido2 !== undefined) map.apellido2 = patch.apellido2;
    if (patch.email !== undefined) map.email = patch.email;

    const incomingIds = Array.isArray(patch.rolIds)
      ? patch.rolIds.map(Number)
      : undefined;

    if (incomingIds?.length) map.rol_id = incomingIds[0];
    else if (patch.rolId !== undefined) map.rol_id = patch.rolId;

    if (patch.unidadId !== undefined) map.unidad_id = patch.unidadId;

    const updated = await userRepo.update(id, map);
    if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

    if (incomingIds?.length) {
      await userRepo.setRoles(id, incomingIds);
    }

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

      try {
        if (permRepo?.setForUser && typeof permRepo.setForUser === "function") {
          await permRepo.setForUser(id, perms);
        } else {
          console.warn(
            "[WARN] permRepo.setForUser undefined. Skipping perms (update)."
          );
        }
      } catch (err) {
        console.error("[ERROR] Failed updating editor perms:", err.message);
      }
    }

    await safeAudit({
      actorId: actor?.id ?? null,
      action: "USER_UPDATE",
      result: "OK",
      detail: { userId: id, patch },
    });

    const hydrated = await userRepo.findById(id);

    let applied = [];
    try {
      if (permRepo?.getForUser && typeof permRepo.getForUser === "function") {
        applied = await permRepo.getForUser(id);
      }
    } catch (err) {
      console.warn(
        "[WARN] Could not fetch editor perms (update):",
        err.message
      );
    }

    return { ...hydrated, editorPermissions: applied, permisosEditor: applied };
  },

  /** Eliminar usuario */
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

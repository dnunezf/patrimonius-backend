import { userRepo } from "../repositories/userRepo.js";
import { permRepo } from "../repositories/permisosEditorRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

const EDITOR_ID = 2; // Ajusta este valor si cambia en la DB

/** Core user management for HU-001. */
export const userService = {
    async create(data, actor) {
        // Crear el usuario
        const created = await userRepo.create({
            nombre: data.nombre,
            apellido1: data.apellido1,
            apellido2: data.apellido2 ?? "",
            email: data.email,
            rolId: data.rolId,
            unidadId: data.unidadId,
        });

        // Asignar permisos si el rol es Editor
        const perms = data.rolId === EDITOR_ID ? data.permisosEditor || ['EDIT', 'SIGN'] : []; // Asignamos permisos EDIT y SIGN
        await permRepo.setForUser(created.id, perms);

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "USER_CREATE",
            result: "OK",
            detail: { userId: created.id, rolId: data.rolId, perms },
        });

        created.permisosEditor = await permRepo.getForUser(created.id); // Obtener permisos asignados
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

        // Actualizar el usuario
        const updated = await userRepo.update(id, map);
        if (!updated) throw Object.assign(new Error("not found"), { code: 404 });

        // Si el rol es Editor, asignar permisos de EDIT y SIGN
        if (patch.rolId !== undefined || patch.permisosEditor !== undefined) {
            const rolId = patch.rolId ?? updated.rolId;
            const perms = rolId === EDITOR_ID ? patch.permisosEditor || ['EDIT', 'SIGN'] : []; // Asignar permisos EDIT y SIGN
            await permRepo.setForUser(id, perms); // Actualizar permisos
        }

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "USER_UPDATE",
            result: "OK",
            detail: { userId: id, patch },
        });

        updated.permisosEditor = await permRepo.getForUser(id); // Obtener permisos asignados
        return updated;
    },

    async remove(id, actor) {
        await userRepo.remove(id);

        // Registrar la eliminación en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "USER_DELETE",
            result: "OK",
            detail: { userId: id },
        });
    },
};

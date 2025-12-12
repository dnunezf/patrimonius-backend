// src/services/CatalogoRoles.service.js
import { catalogoRolesRepo } from "../repositories/catalogoRolesRepo.js";

function ensureNombre(nombre) {
    const n = (nombre ?? "").trim();
    if (!n) {
        const e = new Error("El nombre es obligatorio");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return n;
}

export const roleService = {
    /** Crear rol */
    async create(dto) {
        try {
            const nombre = ensureNombre(dto?.nombre ?? dto?.nombreRol);
            const descripcion = dto?.descripcion ?? null;
            const created = await catalogoRolesRepo.create({ nombre, descripcion });
            return created; // { id, nombre, descripcion }
        } catch (e) {
            // Normaliza códigos de error
            if (e?.code === 409 || e?.code === "ER_DUP_ENTRY") {
                const err = new Error("Ya existe un rol con ese nombre");
                err.code = "ER_DUP_ENTRY";
                throw err;
            }
            if (e?.code === 400 || e?.code === "BAD_REQUEST") {
                const err = new Error(e.message || "Datos inválidos");
                err.code = "BAD_REQUEST";
                throw err;
            }
            throw e;
        }
    },

    /** Listar roles */
    async list() {
        const list = await catalogoRolesRepo.findAll();
        // Asegura forma homogénea
        return list.map(r => ({
            id: r.id,
            nombre: r.nombre,
            descripcion: r.descripcion ?? null,
        }));
    },

    /** Actualizar (PATCH) */
    async update(id, patch) {
        if (!Number.isFinite(Number(id))) {
            const e = new Error("ID inválido");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const dto = {};
        if (patch?.nombre !== undefined || patch?.nombreRol !== undefined) {
            dto.nombre = ensureNombre(patch?.nombre ?? patch?.nombreRol);
        }
        if (patch?.descripcion !== undefined) {
            dto.descripcion = patch.descripcion;
        }

        const updated = await catalogoRolesRepo.update(Number(id), dto);
        if (!updated) {
            const e = new Error("Rol no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }
        return updated; // { id, nombre, descripcion }
    },

    /** Eliminar */
    async remove(id) {
        if (!Number.isFinite(Number(id))) {
            const e = new Error("ID inválido");
            e.code = "BAD_REQUEST";
            throw e;
        }

        try {
            const ok = await catalogoRolesRepo.remove(Number(id));
            if (!ok) {
                const e = new Error("Rol no encontrado");
                e.code = "NOT_FOUND";
                throw e;
            }
            return true;
        } catch (e) {
            // ✅ MySQL: no se puede borrar porque está referenciado (Usuario / Usuario_Rol)
            if (e?.code === "ER_ROW_IS_REFERENCED_2") {
                const usage = await catalogoRolesRepo.countUsersUsingRole(Number(id));

                const err = new Error(
                    `No se puede eliminar el rol porque está asignado a usuarios. ` +
                    `(principal: ${usage.primary}, adicionales: ${usage.extra})`
                );
                err.code = "CONFLICT";
                err.meta = usage; // opcional: por si querés mostrar conteos en frontend
                throw err;
            }

            throw e;
        }
    },

};

import { catalogoRolesRepo } from "../repositories/catalogoRolesRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

/** Servicio de administración de roles para HU-003 */
export const roleService = {
    async create(data, actor) {
        // Validación de datos de entrada
        if (!data.nombre || !data.descripcion) {
            throw new Error("Faltan datos para crear el rol.");
        }

        // Verificar si el rol ya existe
        const existingRole = await catalogoRolesRepo.findByName(data.nombre);
        if (existingRole) {
            throw new Error("El rol con ese nombre ya existe.");
        }

        try {
            // Crear el nuevo rol
            const created = await catalogoRolesRepo.create({
                nombre: data.nombre,
                descripcion: data.descripcion,
            });

            // Log de la acción del administrador
            await logAdminAction({
                actorId: actor?.id ?? null,
                action: "ROLE_CREATE",
                result: "OK",
                detail: { rolId: created.id, nombre: data.nombre },
            });

            return created;
        } catch (e) {
            throw new Error(`Error al crear el rol: ${e.message}`);
        }
    },

    async list() {
        try {
            // Listar todos los roles
            return await catalogoRolesRepo.findAll();
        } catch (e) {
            throw new Error(`Error al listar los roles: ${e.message}`);
        }
    },

    async update(id, patch, actor) {
        // Validación de datos de entrada
        if (!patch || (!patch.nombre && !patch.descripcion)) {
            throw new Error("No se han proporcionado datos válidos para actualizar el rol.");
        }

        try {
            // Verificar si el rol existe
            const existingRole = await catalogoRolesRepo.findById(id);
            if (!existingRole) {
                throw new Error("El rol que intenta actualizar no existe.");
            }

            // Preparar los datos para la actualización
            const map = {};
            if (patch.nombre) map.nombre = patch.nombre;
            if (patch.descripcion) map.descripcion = patch.descripcion;

            // Actualizar rol
            const updated = await catalogoRolesRepo.update(id, map);

            // Log de la acción del administrador
            await logAdminAction({
                actorId: actor?.id ?? null,
                action: "ROLE_UPDATE",
                result: "OK",
                detail: { rolId: id, patch },
            });

            return updated;
        } catch (e) {
            throw new Error(`Error al actualizar el rol: ${e.message}`);
        }
    },

    async remove(id, actor) {
        try {
            // Verificar si el rol existe
            const existingRole = await catalogoRolesRepo.findById(id);
            if (!existingRole) {
                throw new Error("El rol que intenta eliminar no existe.");
            }

            // Eliminar rol
            await catalogoRolesRepo.remove(id);

            // Log de la acción del administrador
            await logAdminAction({
                actorId: actor?.id ?? null,
                action: "ROLE_DELETE",
                result: "OK",
                detail: { rolId: id },
            });
        } catch (e) {
            throw new Error(`Error al eliminar el rol: ${e.message}`);
        }
    },
};

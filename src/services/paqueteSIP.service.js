//src/services/paqueteSIP.service.js
import { categoriaRepo } from "../repositories/categoriaRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Si es necesario

/** Core for managing Categorias. */
export const categoriaService = {
    async create(categoriaData, actor) {
        // Crear una nueva categoría
        const created = await categoriaRepo.createCategoria(categoriaData);

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "CATEGORIA_CREATE",
            result: "OK",
            detail: { categoriaId: created.id, nombre: categoriaData.nombre },
        });

        return created;
    },

    async list() {
        return categoriaRepo.getAllCategorias();
    },

    async update(id, patch, actor) {
        const updated = await categoriaRepo.updateCategoria(id, patch);
        if (!updated) throw Object.assign(new Error("Categoría no encontrada"), { code: 404 });

        // Registrar la acción en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "CATEGORIA_UPDATE",
            result: "OK",
            detail: { categoriaId: id, patch },
        });

        return updated;
    },

    async remove(id, actor) {
        await categoriaRepo.removeCategoria(id);

        // Registrar la eliminación en la bitácora
        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "CATEGORIA_DELETE",
            result: "OK",
            detail: { categoriaId: id },
        });
    },
};
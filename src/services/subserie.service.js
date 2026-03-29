// src/services/subserie.service.js
import { subserieRepo } from "../repositories/subserieRepo.js";  // Repositorio de Subserie
import { logAdminAction } from "../repositories/bitacoraRepo.js";  // Registro de acción

export const subserieService = {
    // Crear una nueva subserie
    async createSubserie({ codigo, nombre, serie_id, descripcion }) {
        if (!codigo || !nombre || !serie_id) {
            throw new Error("El código, nombre y serie_id son requeridos");
        }

        const subserie = await subserieRepo.createSubserie({ codigo, nombre, serie_id, descripcion });

        // Registrar la acción
        await logAdminAction({
            action: "SUBSERIE_CREATE",
            result: "OK",
            subserieId: subserie.id,
            subserieCodigo: subserie.codigo,
        });

        return subserie;
    },

    // Obtener todas las subseries
    async getAllSubseries() {
        return await subserieRepo.getAllSubseries();
    },

    // Obtener subserie por ID
    async getSubserieById(subserieId) {
        const subserie = await subserieRepo.getSubserieById(subserieId);
        if (!subserie) {
            throw new Error("Subserie no encontrada");
        }
        return subserie;
    },

    // Actualizar una subserie
    async updateSubserie(id, { codigo, nombre, serie_id, descripcion }) {
        const subserie = await subserieRepo.getSubserieById(id);
        if (!subserie) {
            throw new Error("Subserie no encontrada");
        }

        const updatedSubserie = await subserieRepo.updateSubserie(id, { codigo, nombre, serie_id, descripcion });

        // Registrar la acción
        await logAdminAction({
            action: "SUBSERIE_UPDATE",
            result: "OK",
            subserieId: updatedSubserie.id,
            subserieCodigo: updatedSubserie.codigo,
        });

        return updatedSubserie;
    },

    // Eliminar una subserie
    async deleteSubserie(id) {
        const subserie = await subserieRepo.getSubserieById(id);
        if (!subserie) {
            throw new Error("Subserie no encontrada");
        }

        const totalExpedientes = await subserieRepo.countExpedientesBySubserieId(id);
        if (totalExpedientes > 0) {
            throw new Error("Esta subserie tiene expedientes asignados");
        }

        await subserieRepo.deleteSubserie(id);

        await logAdminAction({
            action: "SUBSERIE_DELETE",
            result: "OK",
            subserieId: id,
        });

        return { message: "Subserie eliminada correctamente" };
    },
};
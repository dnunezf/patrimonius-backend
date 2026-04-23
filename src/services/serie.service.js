// src/services/serie.service.js
import { serieRepo } from "../repositories/serieRepo.js"; // Repositorio de Serie
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Registro de acción

export const serieService = {
    // Crear una nueva serie
    async createSerie({ codigo, nombre, unidad_id, descripcion }) {
        if (!codigo || !nombre || !unidad_id) {
            throw new Error("El código, nombre y unidad_id son requeridos");
        }

        const serie = await serieRepo.createSerie({ codigo, nombre, unidad_id, descripcion });

        // Registrar la acción
        await logAdminAction({
            action: "SERIE_CREATE",
            result: "OK",
            serieId: serie.id,
            serieCodigo: serie.codigo,
        });

        return serie;
    },

    // Obtener todas las series
    async getAllSeries() {
        return await serieRepo.getAllSeries();
    },

    // Obtener serie por ID
    async getSerieById(serieId) {
        const serie = await serieRepo.getSerieById(serieId);
        if (!serie) {
            throw new Error("Serie no encontrada");
        }
        return serie;
    },

    async getSeriesByUnidadId(unidadId) {
        if (!unidadId) {
            throw new Error("La unidad del usuario es requerida");
        }

        return await serieRepo.getSeriesByUnidadId(unidadId);
    },

    // Actualizar una serie
    async updateSerie(id, { codigo, nombre, unidad_id, descripcion }) {
        const serie = await serieRepo.getSerieById(id);
        if (!serie) {
            throw new Error("Serie no encontrada");
        }

        const updatedSerie = await serieRepo.updateSerie(id, { codigo, nombre, unidad_id, descripcion });

        // Registrar la acción
        await logAdminAction({
            action: "SERIE_UPDATE",
            result: "OK",
            serieId: updatedSerie.id,
            serieCodigo: updatedSerie.codigo,
        });

        return updatedSerie;
    },

    async deleteSerie(id) {
        const serie = await serieRepo.getSerieById(id);
        if (!serie) {
            throw new Error("Serie no encontrada");
        }

        const totalSubseries = await serieRepo.countSubseriesBySerieId(id);
        if (totalSubseries > 0) {
            throw new Error("Esta serie tiene subseries asignadas");
        }

        const totalExpedientes = await serieRepo.countExpedientesBySerieId(id);
        if (totalExpedientes > 0) {
            throw new Error("Esta serie tiene expedientes asignados");
        }

        await serieRepo.deleteSerie(id);

        await logAdminAction({
            action: "SERIE_DELETE",
            result: "OK",
            serieId: id,
        });

        return { message: "Serie eliminada correctamente" };
    },
};
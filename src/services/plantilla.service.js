// src/services/Plantilla.service.js
import { plantillaRepo } from "../repositories/PlantillaRepo.js";

export const plantillaService = {
    async create(dto) {
        return plantillaRepo.create(dto);
    },

    async list() {
        return plantillaRepo.findAll();
    },

    async get(id) {
        const result = await plantillaRepo.findById(id);
        if (!result) throw Object.assign(new Error("Plantilla no encontrada"), { code: 404 });
        return result;
    },

    async update(id, dto) {
        const updated = await plantillaRepo.update(id, dto);
        if (!updated) throw Object.assign(new Error("Plantilla no encontrada"), { code: 404 });
        return updated;
    },

    async remove(id) {
        return plantillaRepo.remove(id);
    }
};
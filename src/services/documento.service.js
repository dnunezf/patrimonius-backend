// src/services/documento.service.js
import { documentoRepo } from "../repositories/documentoRepo.js";
import { documentoPlantillaRepo } from "../repositories/documentoPlantillaRepo.js";

export const documentoService = {
    async create(dto) {
        // 1. Crear el documento
        const documento = await documentoRepo.create(dto);

        // 2. Si se envió una plantilla_id, asociarla automáticamente
        if (dto.plantilla_id) {
            await documentoPlantillaRepo.link(documento.id, dto.plantilla_id);
            documento.plantilla_id = dto.plantilla_id; // Devolverlo en el objeto también
        }

        return documento;
    },

    async list() {
        return documentoRepo.findAll();
    },

    async get(id) {
        const doc = await documentoRepo.findById(id);
        if (!doc) throw Object.assign(new Error("Documento no encontrado"), { code: 404 });
        return doc;
    },

    async update(id, patch) {
        const updated = await documentoRepo.update(id, patch);
        if (!updated) throw Object.assign(new Error("Documento no encontrado"), { code: 404 });
        return updated;
    },

    async remove(id) {
        return documentoRepo.remove(id);
    }
};
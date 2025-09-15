// src/services/documentoPlantilla.service.js
import { documentoPlantillaRepo } from "../repositories/documentoPlantillaRepo.js";

export const documentoPlantillaService = {
    async vincular(documentoId, plantillaId) {
        return documentoPlantillaRepo.link(documentoId, plantillaId);
    },

    async desvincular(documentoId, plantillaId) {
        return documentoPlantillaRepo.unlink(documentoId, plantillaId);
    },

    async obtenerPlantillas(documentoId) {
        return documentoPlantillaRepo.findPlantillasByDocumento(documentoId);
    }
};
// src/services/unidadOrganizacional.service.js
import { unidadOrganizacionalRepo } from "../repositories/unidadOrganizacionalRepo.js";

export const unidadOrganizacionalService = {
    async getAll() {
        return await unidadOrganizacionalRepo.getAll();
    },
};
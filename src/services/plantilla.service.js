import { plantillaRepo } from "../repositories/PlantillaRepo.js";

export const plantillaService = {
    async create(dto) {
        // Si es necesario, valida el archivo aquí antes de pasarlo al repositorio
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
        // Verifica si hay una nueva ruta de archivo antes de actualizar
        const ruta_archivo = dto.ruta_archivo ? dto.ruta_archivo : undefined;
        const updatedDto = { ...dto, ruta_archivo };

        const updated = await plantillaRepo.update(id, updatedDto);
        if (!updated) throw Object.assign(new Error("Plantilla no encontrada"), { code: 404 });
        return updated;
    },

    async remove(id) {
        return plantillaRepo.remove(id);
    }
};
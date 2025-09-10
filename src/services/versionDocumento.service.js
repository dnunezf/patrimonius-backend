// src/services/documento.service.js
import { documentoRepo } from "../repositories/documentoRepo.js";
import { documentoPlantillaRepo } from "../repositories/documentoPlantillaRepo.js";
import { versionDocumentoService } from "./versionDocumento.service.js";

export const documentoService = {
    async create(dto, actor) {
        // 1. Crear el documento base
        const documento = await documentoRepo.create(dto);

        // 2. Asociar automáticamente la plantilla (si viene incluida)
        if (dto.plantilla_id) {
            await documentoPlantillaRepo.link(documento.id, dto.plantilla_id);
            documento.plantilla_id = dto.plantilla_id;
        }

        // 3. Crear versión inicial del documento
        await versionDocumentoService.create({
            contenido: documento.contenido ?? "",
            fecha: documento.fecha,
            documento_id: documento.id,
            numero: 1  // Primera versión
        }, actor);

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

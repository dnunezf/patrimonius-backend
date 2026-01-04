// src/services/VersionDocumento.service.js
import { documentoRepo } from "../repositories/documentoRepo.js";
import { documentoPlantillaRepo } from "../repositories/documentoPlantillaRepo.js";
import { versionDocumentoService } from "./versionDocumento.service.js";

export const documentoService = {
    async create(dto, actor) {
        const documento = await documentoRepo.create(dto);

        if (dto.plantilla_id) {
            await documentoPlantillaRepo.link(documento.id, dto.plantilla_id);
            documento.plantilla_id = dto.plantilla_id;
        }

        // Versión inicial del documento (sin "numero")
        await versionDocumentoService.create(
            {
                contenido: documento.contenido ?? "",
                fecha: documento.fecha ?? new Date(),
                documento_id: documento.id,
                nombre_versionado: "V1",
            },
            actor
        );

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
    },
};

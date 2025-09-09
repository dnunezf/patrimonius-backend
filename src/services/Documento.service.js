// src/services/documentoService.js
import { permRepo } from "../repositories/permRepo.js";

/** Servicio para manejar documentos */
export const documentoService = {
    async editDocument(userId, documentId, content) {
        const permissions = await permRepo.getForUser(userId);

        // Validar que el usuario tenga permiso para editar
        if (!permissions.includes('EDIT')) {
            throw new Error("No tiene permiso para editar este documento.");
        }

        // Lógica para editar el documento (por ejemplo, actualizar en la base de datos)
        const updatedDocument = await documentRepo.updateContent(documentId, content);
        return updatedDocument;
    },

    async signDocument(userId, documentId) {
        const permissions = await permRepo.getForUser(userId);

        // Validar que el usuario tenga permiso para firmar
        if (!permissions.includes('SIGN')) {
            throw new Error("No tiene permiso para firmar este documento.");
        }

        // Lógica para firmar el documento
        const signedDocument = await documentRepo.sign(documentId);
        return signedDocument;
    }
};

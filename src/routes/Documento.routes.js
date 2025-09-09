// src/routes/documento.routes.js
import { Router } from "express";
import { documentoService } from "../services/Documento.service.js"; // Servicio de documentos

export const documentoRoutes = Router();

/** Editar un documento */
documentoRoutes.patch("/documentos/:id", async (req, res) => {
    try {
        const { userId } = req.user; // Suponiendo que el ID de usuario está en el token
        const documentId = req.params.id;
        const { content } = req.body;

        const updatedDocument = await documentoService.editDocument(userId, documentId, content);
        res.json(updatedDocument);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Firmar un documento */
documentoRoutes.post("/documentos/:id/firma", async (req, res) => {
    try {
        const { userId } = req.user; // Suponiendo que el ID de usuario está en el token
        const documentId = req.params.id;

        const signedDocument = await documentoService.signDocument(userId, documentId);
        res.json(signedDocument);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

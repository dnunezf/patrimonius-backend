// src/routes/documento.routes.js
import { Router } from "express";
import { documentoService } from "../services/documento.service.js";
import router from "./audit.routes.js";
import  { authGuard } from "../middleware/authGuard.js";



export const documentoRoutes = Router();
/** Crear un documento */
//VERSION ANTERIOR: documentoRoutes.post('/documents', authGuard, async (req, res) => {
documentoRoutes.post('/', authGuard, async (req, res) => {
    try {
        //const user_id = req.user.id ?? 1;     // viene del token via authGuard
        //const unidad_id = req.user.unidad_id ?? 1; // decide cómo extraerlo; si no, fija 1 temporalmente
        const user_id   = 1; //De momento se crean los documentos con el id 1 (Usuario Editor Prueba)
        const unidad_id = 1; //De momento se crean los documentos con el id 1 (Unidad organizacinal 1)
        const { titulo, categoria_id, plantilla_id } = req.body;

        if (!titulo) return res.status(400).json({ error: 'validation_error', message: 'titulo es requerido' });

        const created = await documentoService.createDocument({
            titulo,
            categoria_id,
            plantilla_id,
            user_id,
            unidad_id,
        });

        res.status(201).json(created);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

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


// GET route to fetch data from the view
documentoRoutes.get("/view/production", authGuard, async (req, res) => {
    try {
        const userId = req.user.id;
        const documents = await documentoService.getAccessibleDocuments(userId);
        // Send the result to the client
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: "internal_error", message: error.message });
    }
});

/** List all documents */
documentoRoutes.get("/", async (_req, res) => {
    try {
        const documents = await documentoService.getAllDocuments();
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: "internal_error", message: error.message });
    }
});

/** Optional: production view */
documentoRoutes.get("/production", async (_req, res) => {
    try {
        const documents = await documentoService.getDocumentsFromProduction();
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: "internal_error", message: error.message });
    }
});

export default documentoRoutes;
// src/routes/documento.routes.js
import { Router } from "express";
import { documentoService } from "../services/documento.service.js";
import router from "./audit.routes.js";
import  { authGuard } from "../middleware/authGuard.js";
import { editSessionService } from "../services/editSession.service.js";



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

// Ruta para obtener todos los documentos
documentoRoutes.get('/documents', async (req, res) => {
    try {
        console.log('Request received for /documents route');  // Para ver si la ruta se está llamando
        const documents = await documentoService.getAllDocuments();  // Llamamos al servicio para obtener todos los documentos
        res.json(documents);  // Enviar los documentos como respuesta
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: 'Error fetching documents' });
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


/** HU-007: crear documento desde plantilla (CREACION) */
documentoRoutes.post("/documentos/crear-desde-plantilla", async (req, res) => {
    try {
        const userId = req.user?.id; // usamos .id para no interferir con tu código actual
        const unidadId = req.user?.unidad_id || req.body.unidad_id;

        const { plantilla_id, titulo, categoria_id, confid_level, numero_firmas } = req.body;

        const result = await documentoService.createFromPlantilla({
            plantilla_id,
            titulo,
            categoria_id: categoria_id ?? null,
            confid_level: confid_level ?? 'INTERNAL',
            numero_firmas: Number(numero_firmas) || 0,
            usuario_id: userId,
            unidad_id: unidadId
        });

        res.status(201).json(result); // { documento_id, numero_serie }
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-007: preparar para firma (asigna índice oficial y pasa a FIRMA) */
documentoRoutes.put("/documentos/:id/preparar-firma", async (req, res) => {
    try {
        const userId = req.user?.id;
        const documento_id = Number(req.params.id);
        const result = await documentoService.prepareForSignature({ documento_id, usuario_id: userId });
        res.json(result); // { documento_id, numero_serie_oficial }
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: obtener última versión del documento */
documentoRoutes.get("/documentos/:id/version/latest", async (req, res) => {
    try {
        const data = await documentoService.getLatestVersion(Number(req.params.id));
        res.json(data); // { id, fecha } | null
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: guardar colaborativamente con control de versiones */
documentoRoutes.put("/documentos/:id/colab-guardar", async (req, res) => {
    try {
        const usuario_id = req.user?.id;
        const documento_id = Number(req.params.id);
        const { contenido, base_version_id } = req.body;

        const result = await documentoService.colabSave({
            documento_id,
            usuario_id,
            contenido,
            base_version_id: Number(base_version_id)
        });

        res.json(result); // { version_id, next_version, conflict:false }
    } catch (e) {
        if (e.code === 'VERSION_CONFLICT') {
            return res.status(409).json({ error: "version_conflict", details: e.details });
        }
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: adquirir/renovar lock de edición */
documentoRoutes.post("/documentos/:id/lock", async (req, res) => {
    try {
        const usuario_id = req.user?.id;
        const documento_id = Number(req.params.id);
        const ttlSeconds = Number(req.body.ttlSeconds) || 180;

        const out = await documentoService.acquireLock({ documento_id, usuario_id, ttlSeconds });
        res.json(out); // { holder:{usuario_id}, expires_at }
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: liberar lock de edición */
documentoRoutes.delete("/documentos/:id/lock", async (req, res) => {
    try {
        const usuario_id = req.user?.id;
        const documento_id = Number(req.params.id);
        await documentoService.releaseLock({ documento_id, usuario_id });
        res.status(204).end();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: leer lock actual */
documentoRoutes.get("/documentos/:id/lock", async (req, res) => {
    try {
        const lock = await documentoService.readLock(Number(req.params.id));
        res.json(lock || null); // {usuario_id, expires_at} | null
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-016: listar comentarios de un documento */
documentoRoutes.get("/documentos/:id/comentarios", async (req, res) => {
    try {
        const rows = await documentoService.listComentarios(Number(req.params.id));
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-016: agregar comentario */
documentoRoutes.post("/documentos/:id/comentarios", async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuario_id = req.user?.id;
        const { descripcion } = req.body;

        const result = await documentoService.addComentario({ documento_id, usuario_id, descripcion });
        res.status(201).json(result); // { comentario_id }
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-016: marcar comentario como resuelto */
documentoRoutes.patch("/comentarios/:comentarioId/resolver", async (req, res) => {
    try {
        const usuario_id = req.user?.id;
        const comentario_id = Number(req.params.comentarioId);
        const out = await documentoService.resolveComentario({ comentario_id, usuario_id });
        res.json(out); // { ok:true }
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

documentoRoutes.post("/documentos/:id/sessions", async (req, res) => {
    try {
        const usuario_id = req.user?.id;
        const documento_id = Number(req.params.id);

        const out = await editSessionService.touch(documento_id, usuario_id);
        res.json(out);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: listar usuarios activos en edición */
documentoRoutes.get("/documentos/:id/sessions", async (req, res) => {
    try {
        const documento_id = Number(req.params.id);
        const usuarios = await editSessionService.list(documento_id, 60); // últimos 60s
        res.json(usuarios);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** HU-008: cerrar sesión explícita */
documentoRoutes.delete("/documentos/:id/sessions", async (req, res) => {
    try {
        const usuario_id = req.user?.id;
        const documento_id = Number(req.params.id);

        await editSessionService.remove(documento_id, usuario_id);
        res.status(204).end();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

export default documentoRoutes;
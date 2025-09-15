import { Router } from 'express';
import { versionDocumentoService } from './versionDocumentoService.js';

const router = Router();

// Crear una nueva versión de documento
router.post('/versions', async (req, res) => {
    try {
        const { numero, fecha, contenido, documentoId } = req.body;
        const actor = req.user;  // Suponiendo que tienes información del usuario autenticado en req.user
        const newVersion = await versionDocumentoService.create({ numero, fecha, contenido, documentoId }, actor);
        res.status(201).json(newVersion);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la versión del documento.' });
    }
});

// Obtener todas las versiones de un documento
router.get('/versions/:documentoId', async (req, res) => {
    try {
        const versions = await versionDocumentoService.list(req.params.documentoId);
        res.status(200).json(versions);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las versiones del documento.' });
    }
});

// Obtener una versión de documento por ID
router.get('/versions/:id', async (req, res) => {
    try {
        const version = await versionDocumentoService.getVersionById(req.params.id);
        if (!version) {
            return res.status(404).json({ error: 'Versión no encontrada.' });
        }
        res.status(200).json(version);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la versión del documento.' });
    }
});

// Actualizar una versión de documento
router.put('/versions/:id', async (req, res) => {
    try {
        const updatedVersion = await versionDocumentoService.update(req.params.id, req.body, req.user);
        res.status(200).json(updatedVersion);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la versión del documento.' });
    }
});

// Eliminar una versión de documento
router.delete('/versions/:id', async (req, res) => {
    try {
        await versionDocumentoService.remove(req.params.id, req.user);
        res.status(200).json({ message: 'Versión de documento eliminada correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar la versión del documento.' });
    }
});

export { router };
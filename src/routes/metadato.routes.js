import { Router } from 'express';
import { metadatoService } from './metadatoService.js';

const router = Router();

// Crear un nuevo metadato
router.post('/metadatos', async (req, res) => {
    try {
        const { tipo, documentoId, valor } = req.body;
        const actor = req.user;  // Suponiendo que tienes información del usuario autenticado en req.user
        const newMetadato = await metadatoService.create({ tipo, documentoId, valor }, actor);
        res.status(201).json(newMetadato);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el metadato.' });
    }
});

// Obtener todos los metadatos de un documento
router.get('/metadatos/:documentoId', async (req, res) => {
    try {
        const metadatos = await metadatoService.list(req.params.documentoId);
        res.status(200).json(metadatos);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los metadatos del documento.' });
    }
});

// Obtener un metadato por ID
router.get('/metadatos/:id', async (req, res) => {
    try {
        const metadato = await metadatoService.getMetadatoById(req.params.id);
        if (!metadato) {
            return res.status(404).json({ error: 'Metadato no encontrado.' });
        }
        res.status(200).json(metadato);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el metadato.' });
    }
});

// Actualizar un metadato
router.put('/metadatos/:id', async (req, res) => {
    try {
        const updatedMetadato = await metadatoService.update(req.params.id, req.body, req.user);
        res.status(200).json(updatedMetadato);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el metadato.' });
    }
});

// Eliminar un metadato
router.delete('/metadatos/:id', async (req, res) => {
    try {
        await metadatoService.remove(req.params.id, req.user);
        res.status(200).json({ message: 'Metadato eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el metadato.' });
    }
});

export { router };
//src/services/firma.service.js
import { Router } from 'express';
import { firmaService } from './firmaService.js';

const router = Router();

// Crear una nueva firma
router.post('/firmas', async (req, res) => {
    try {
        const { documento_id, usuario_id, fecha } = req.body;
        const actor = req.user;  // Suponiendo que tienes información del usuario autenticado en req.user
        const newFirma = await firmaService.create({ documento_id, usuario_id, fecha }, actor);
        res.status(201).json(newFirma);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la firma.' });
    }
});

// Obtener todas las firmas de un documento
router.get('/firmas/:documentoId', async (req, res) => {
    try {
        const firmas = await firmaService.list(req.params.documentoId);
        res.status(200).json(firmas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las firmas del documento.' });
    }
});

// Obtener una firma por ID
router.get('/firmas/:id', async (req, res) => {
    try {
        const firma = await firmaService.getFirmaById(req.params.id);
        if (!firma) {
            return res.status(404).json({ error: 'Firma no encontrada.' });
        }
        res.status(200).json(firma);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la firma.' });
    }
});

// Actualizar una firma
router.put('/firmas/:id', async (req, res) => {
    try {
        const updatedFirma = await firmaService.update(req.params.id, req.body, req.user);
        res.status(200).json(updatedFirma);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la firma.' });
    }
});

// Eliminar una firma
router.delete('/firmas/:id', async (req, res) => {
    try {
        await firmaService.remove(req.params.id, req.user);
        res.status(200).json({ message: 'Firma eliminada correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar la firma.' });
    }
});

export { router };
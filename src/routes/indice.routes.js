import { Router } from 'express';
import { indiceRepo } from './indiceRepo.js';

const router = Router();

// Crear un nuevo índice electrónico
router.post('/indices', async (req, res) => {
    try {
        const { hash, fecha, firmaId } = req.body;
        const newIndex = await indiceRepo.createIndex({ hash, fecha, firmaId });
        res.status(201).json(newIndex);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el índice electrónico.' });
    }
});

// Obtener todos los índices electrónicos
router.get('/indices', async (req, res) => {
    try {
        const indices = await indiceRepo.getAllIndices();
        res.status(200).json(indices);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los índices electrónicos.' });
    }
});

// Obtener un índice electrónico por ID
router.get('/indices/:id', async (req, res) => {
    try {
        const index = await indiceRepo.getIndexById(req.params.id);
        if (!index) {
            return res.status(404).json({ error: 'Índice no encontrado.' });
        }
        res.status(200).json(index);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el índice electrónico.' });
    }
});

// Actualizar un índice electrónico
router.put('/indices/:id', async (req, res) => {
    try {
        const updatedIndex = await indiceRepo.updateIndex(req.params.id, req.body);
        res.status(200).json(updatedIndex);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el índice electrónico.' });
    }
});

// Eliminar un índice electrónico
router.delete('/indices/:id', async (req, res) => {
    try {
        await indiceRepo.removeIndex(req.params.id);
        res.status(200).json({ message: 'Índice electrónico eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el índice electrónico.' });
    }
});

export { router };
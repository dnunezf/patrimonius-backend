//src/routes/categoria.routes.js
import { Router } from 'express';
import { categoriaService } from '../services/categoria.service.js';

const router = Router();

// Crear una nueva categoría
router.post('/categorias', async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        const actor = req.user;  // Suponiendo que tienes información del usuario autenticado en req.user
        const newCategoria = await categoriaService.create({ nombre, descripcion }, actor);
        res.status(201).json(newCategoria);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la categoría.' });
    }
});

// Obtener todas las categorías
router.get('/categorias', async (req, res) => {
    console.log("GET /categorias reached");
    try {
        const categorias = await categoriaService.list();
        res.status(200).json(categorias);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las categorías.' });
    }
});

// Obtener una categoría por ID
router.get('/categorias/:id', async (req, res) => {
    try {
        const categoria = await categoriaService.getCategoriaById(req.params.id);
        if (!categoria) {
            return res.status(404).json({ error: 'Categoría no encontrada.' });
        }
        res.status(200).json(categoria);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la categoría.' });
    }
});

// Actualizar una categoría
router.put('/categorias/:id', async (req, res) => {
    try {
        const updatedCategoria = await categoriaService.update(req.params.id, req.body, req.user);
        res.status(200).json(updatedCategoria);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la categoría.' });
    }
});

// Eliminar una categoría
router.delete('/categorias/:id', async (req, res) => {
    try {
        await categoriaService.remove(req.params.id, req.user);
        res.status(200).json({ message: 'Categoría eliminada correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar la categoría.' });
    }
});

export { router as categoriaRouter };
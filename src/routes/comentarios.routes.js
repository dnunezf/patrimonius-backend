import { Router } from 'express';
import { comentariosService } from './comentariosService.js';

const router = Router();

// Crear un nuevo comentario
router.post('/comentarios', async (req, res) => {
    try {
        const { usuarioId, documentoId, descripcion } = req.body;
        const actor = req.user;  // Suponiendo que tienes información del usuario autenticado en req.user
        const newComment = await comentariosService.create({ usuarioId, documentoId, descripcion }, actor);
        res.status(201).json(newComment);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el comentario.' });
    }
});

// Obtener todos los comentarios de un documento
router.get('/comentarios/:documentoId', async (req, res) => {
    try {
        const comentarios = await comentariosService.list(req.params.documentoId);
        res.status(200).json(comentarios);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los comentarios del documento.' });
    }
});

// Eliminar un comentario
router.delete('/comentarios/:id', async (req, res) => {
    try {
        await comentariosService.remove(req.params.id, req.user);
        res.status(200).json({ message: 'Comentario eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el comentario.' });
    }
});

export { router };
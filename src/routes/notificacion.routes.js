import { Router } from 'express';
import { notificacionService } from './notificacionService.js';

const router = Router();

// Crear una nueva notificación
router.post('/notificaciones', async (req, res) => {
    try {
        const { fecha, tipo, resultado, usuarioId, documentoId } = req.body;
        const actor = req.user;  // Suponiendo que tienes información del usuario autenticado en req.user
        const newNotificacion = await notificacionService.create({ fecha, tipo, resultado, usuarioId, documentoId }, actor);
        res.status(201).json(newNotificacion);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la notificación.' });
    }
});

// Obtener todas las notificaciones
router.get('/notificaciones', async (req, res) => {
    try {
        const notificaciones = await notificacionService.list();
        res.status(200).json(notificaciones);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las notificaciones.' });
    }
});

// Obtener una notificación por ID
router.get('/notificaciones/:id', async (req, res) => {
    try {
        const notificacion = await notificacionService.getNotificacionById(req.params.id);
        if (!notificacion) {
            return res.status(404).json({ error: 'Notificación no encontrada.' });
        }
        res.status(200).json(notificacion);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la notificación.' });
    }
});

// Eliminar una notificación
router.delete('/notificaciones/:id', async (req, res) => {
    try {
        await notificacionService.remove(req.params.id, req.user);
        res.status(200).json({ message: 'Notificación eliminada correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar la notificación.' });
    }
});

export { router };
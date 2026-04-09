import { Router } from 'express';
import * as gestionPlazosService from '../services/gestionPlazos.service.js';
import {authGuard} from '../middleware/authGuard.js';

const router = Router();

router.use(authGuard);

// Asignar plazo manual a un documento archivado
router.post('/:id/asignar', async (req, res) => {
    try {
        const documentoId = Number(req.params.id);
        const usuarioId = req.user?.id;

        if (!Number.isInteger(documentoId) || documentoId <= 0) {
            return res.status(400).json({ error: 'ID de documento inválido' });
        }

        if (!usuarioId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const result = await gestionPlazosService.asignarPlazoConservacion(
            documentoId,
            req.body,
            usuarioId
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al asignar plazo de conservación:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al asignar plazo de conservación',
        });
    }
});

// Listado general de documentos con plazo asignado
router.get('/', async (req, res) => {
    try {
        const result = await gestionPlazosService.listarDocumentosConPlazo(req.query);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al listar documentos con plazo:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al listar documentos con plazo',
        });
    }
});

// Documentos próximos a vencer
router.get('/proximos', async (req, res) => {
    try {
        const days = req.query.days || 30;
        const result = await gestionPlazosService.listarProximosAVencer(days);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al listar documentos próximos a vencer:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al listar próximos a vencer',
        });
    }
});

// Documentos vencidos
router.get('/vencidos', async (req, res) => {
    try {
        const result = await gestionPlazosService.listarVencidos();
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al listar documentos vencidos:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al listar vencidos',
        });
    }
});

router.post('/revisar-vencimientos', async (req, res) => {
    try {
        const days = req.body?.days || 30;
        const result = await gestionPlazosService.revisarYNotificarVencimientos(days);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al revisar vencimientos:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al revisar vencimientos',
        });
    }
});

export default router;
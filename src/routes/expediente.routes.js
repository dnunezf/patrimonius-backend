import express from 'express';
import { expedienteService } from '../services/expediente.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const data = await expedienteService.list(req.query);
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al obtener los expedientes'
        });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const data = await expedienteService.getById(req.params.id);
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al obtener el expediente'
        });
    }
});

router.post('/', async (req, res) => {
    try {
        const data = await expedienteService.create(req.body);
        res.status(201).json({
            message: 'Expediente creado correctamente',
            data
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al crear el expediente'
        });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const data = await expedienteService.update(req.params.id, req.body);
        res.status(200).json({
            message: 'Expediente actualizado correctamente',
            data
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al actualizar el expediente'
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await expedienteService.remove(req.params.id);
        res.status(200).json({
            message: 'Expediente eliminado correctamente'
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al eliminar el expediente'
        });
    }
});

export default router;
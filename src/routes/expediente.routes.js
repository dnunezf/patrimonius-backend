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

router.get('/search-access', async (req, res) => {
    try {
        const userId = req.user?.id;
        const data = await expedienteService.searchAccess({
            userId,
            user: req.user,
            query: req.query,
        });
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 : 500
        ).json({
            message: error.message || 'Error al consultar expedientes para acceso'
        });
    }
});

router.get('/:id/documentos-acceso', async (req, res) => {
    try {
        const data = await expedienteService.getDocumentosAccesoExpediente({
            expedienteId: req.params.id,
            user: req.user,
            query: req.query,
        });
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 : 500
        ).json({
            message: error.message || 'Error al consultar documentos del expediente'
        });
    }
});

router.get('/:id/download-zip', async (req, res) => {
    try {
        await expedienteService.downloadExpedienteZip({
            expedienteId: req.params.id,
            user: req.user,
            actor: req.actor,
            req,
            res,
        });
    } catch (error) {
        if (!res.headersSent) {
            res.status(
                error?.code === 'FORBIDDEN' ? 403 :
                    error?.code === 'NOT_FOUND' ? 404 :
                        error?.code === 'BAD_REQUEST' ? 400 : 500
            ).json({
                message: error.message || 'Error al generar el archivo ZIP del expediente'
            });
        }
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
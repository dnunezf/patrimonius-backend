import express from 'express';
import { CatalogoSubserieService } from '../services/CatalogoSubserie.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { serie_id } = req.query;
        const data = await CatalogoSubserieService.list(serie_id);
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al obtener las subseries'
        });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const data = await CatalogoSubserieService.getById(req.params.id);
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al obtener la subserie'
        });
    }
});

router.post('/', async (req, res) => {
    try {
        const data = await CatalogoSubserieService.create(req.body);
        res.status(201).json({
            message: 'Subserie creada correctamente',
            data
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al crear la subserie'
        });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const data = await CatalogoSubserieService.update(req.params.id, req.body);
        res.status(200).json({
            message: 'Subserie actualizada correctamente',
            data
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al actualizar la subserie'
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await CatalogoSubserieService.remove(req.params.id);
        res.status(200).json({
            message: 'Subserie eliminada correctamente'
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al eliminar la subserie'
        });
    }
});

export default router;
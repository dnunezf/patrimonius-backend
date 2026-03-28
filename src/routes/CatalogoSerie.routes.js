import express from 'express';
import { CatalogoSerieService } from '../services/CatalogoSerie.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { unidad_id } = req.query;
        const data = await CatalogoSerieService.list(unidad_id);
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al obtener las series'
        });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const data = await CatalogoSerieService.getById(req.params.id);
        res.status(200).json(data);
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al obtener la serie'
        });
    }
});

router.post('/', async (req, res) => {
    try {
        const data = await CatalogoSerieService.create(req.body);
        res.status(201).json({
            message: 'Serie creada correctamente',
            data
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al crear la serie'
        });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const data = await CatalogoSerieService.update(req.params.id, req.body);
        res.status(200).json({
            message: 'Serie actualizada correctamente',
            data
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al actualizar la serie'
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await CatalogoSerieService.remove(req.params.id);
        res.status(200).json({
            message: 'Serie eliminada correctamente'
        });
    } catch (error) {
        res.status(
            error?.code === 'BAD_REQUEST' ? 400 :
                error?.code === 'NOT_FOUND' ? 404 :
                    error?.code === 'CONFLICT' || error?.code === 'ER_DUP_ENTRY' ? 409 : 500
        ).json({
            message: error.message || 'Error al eliminar la serie'
        });
    }
});

export default router;
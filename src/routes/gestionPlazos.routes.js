import { Router } from 'express';
import * as gestionPlazosService from '../services/gestionPlazos.service.js';
import {authGuard} from '../middleware/authGuard.js';

const router = Router();

router.use(authGuard);

// Extender vigencia (fecha_vencimiento) del expediente — bitácora ACTUALIZACION
router.post('/expediente/:expedienteId/extender-vigencia', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        const actor = req.actor ?? req.user ?? null;

        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }

        const result = await gestionPlazosService.extenderVigenciaExpediente(
            expedienteId,
            req.body,
            actor
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al extender vigencia del expediente:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al extender la vigencia',
        });
    }
});

// HU-032 — detalle conservación + bitácora / trazabilidad
router.get('/expediente/:expedienteId/detalle-conservacion', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }
        const result =
            await gestionPlazosService.obtenerDetalleConservacionExpediente(expedienteId);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al obtener detalle de conservación:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al obtener el detalle',
        });
    }
});

router.post('/expediente/:expedienteId/disposicion/iniciar', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        const actor = req.actor ?? req.user ?? null;
        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }
        const result = await gestionPlazosService.iniciarDisposicionExpediente(
            expedienteId,
            req.body,
            actor
        );
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al iniciar disposición:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al iniciar disposición',
        });
    }
});

router.post('/expediente/:expedienteId/disposicion/revision', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        const actor = req.actor ?? req.user ?? null;
        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }
        const result = await gestionPlazosService.registrarRevisionDisposicionExpediente(
            expedienteId,
            req.body,
            actor
        );
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al registrar revisión de disposición:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al registrar la revisión',
        });
    }
});

router.post('/expediente/:expedienteId/disposicion/aprobar', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        const actor = req.actor ?? req.user ?? null;
        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }
        const result = await gestionPlazosService.aprobarYEjecutarDisposicionExpediente(
            expedienteId,
            req.body,
            actor
        );
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al aprobar disposición:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al aprobar la disposición',
        });
    }
});

router.post('/expediente/:expedienteId/disposicion/rechazar', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        const actor = req.actor ?? req.user ?? null;
        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }
        const result = await gestionPlazosService.rechazarDisposicionExpediente(
            expedienteId,
            req.body,
            actor
        );
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al rechazar disposición:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al rechazar la disposición',
        });
    }
});

/** Transferencia: inicio + revisión + ejecución (ZIP) en un solo paso (HU-032). */
router.post('/expediente/:expedienteId/disposicion/transferencia/ejecutar', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        const actor = req.actor ?? req.user ?? null;
        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }
        const result = await gestionPlazosService.ejecutarDisposicionTransferenciaCompleta(
            expedienteId,
            req.body,
            actor
        );
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al ejecutar transferencia de disposición:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Error interno al ejecutar la transferencia',
        });
    }
});

/** Descarga del ZIP de transferencia generado por la disposición (JWT). */
router.get('/expediente/:expedienteId/disposicion/paquete-transferencia-zip', async (req, res) => {
    try {
        const expedienteId = Number(req.params.expedienteId);
        if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
            return res.status(400).json({ error: 'ID de expediente inválido' });
        }
        await gestionPlazosService.streamPaqueteTransferenciaZip(expedienteId, res);
    } catch (error) {
        console.error('Error al descargar ZIP de transferencia:', error);
        if (!res.headersSent) {
            return res.status(error.status || 500).json({
                error: error.message || 'Error interno al descargar el paquete',
            });
        }
    }
});

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
        const q = { ...req.query };
        if (q.solo_vencidos === '1' || q.solo_vencidos === 'true') {
            q.solo_vencidos = true;
        }
        const result = await gestionPlazosService.listarDocumentosConPlazo(q);
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
import { Router } from "express";
import { solicitudAccesoService } from "../services/solicitudAcceso.service.js";
import { authGuard } from "../middleware/authGuard.js";
import { adminGuard } from "../middleware/adminGuard.js";

const solicitudAccesoRouter = Router();

/**
 * Crear solicitud de acceso
 * El usuario autenticado solo envía justificacion.
 * documento_id viene por params.
 */
solicitudAccesoRouter.post(
    "/documentos/:documentoId/solicitudes-acceso",
    authGuard,
    async (req, res) => {
        try {
            const usuario_solicitante_id = req.user.id;
            const documento_id = Number(req.params.documentoId);
            const { justificacion } = req.body;

            const result = await solicitudAccesoService.createSolicitud({
                justificacion,
                usuario_solicitante_id,
                documento_id,
            });

            res.status(201).json(result);
        } catch (e) {
            const code =
                e.code === "BAD_REQUEST"
                    ? 400
                    : e.code === "FORBIDDEN"
                        ? 403
                        : e.code === "NOT_FOUND"
                            ? 404
                            : e.code === "STATE_ERROR"
                                ? 409
                                : 500;

            res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    }
);

/**
 * Listar mis solicitudes
 */
solicitudAccesoRouter.get(
    "/mis-solicitudes-acceso",
    authGuard,
    async (req, res) => {
        try {
            const rows = await solicitudAccesoService.listMisSolicitudes(req.user.id);
            res.json(rows);
        } catch (e) {
            res.status(500).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    }
);

/**
 * Listar todas las solicitudes
 * Solo admin
 */
solicitudAccesoRouter.get(
    "/solicitudes-acceso",
    authGuard,
    adminGuard,
    async (_req, res) => {
        try {
            const rows = await solicitudAccesoService.listSolicitudes();
            res.json(rows);
        } catch (e) {
            res.status(500).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    }
);

/**
 * Obtener una solicitud por id
 * Solo admin por ahora
 */
solicitudAccesoRouter.get(
    "/solicitudes-acceso/:id",
    authGuard,
    adminGuard,
    async (req, res) => {
        try {
            const row = await solicitudAccesoService.getSolicitudById(
                Number(req.params.id)
            );
            res.json(row);
        } catch (e) {
            const code = e.code === "NOT_FOUND" ? 404 : 500;
            res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    }
);

/**
 * Resolver solicitud
 * Solo admin
 */
solicitudAccesoRouter.patch(
    "/solicitudes-acceso/:id/resolver",
    authGuard,
    adminGuard,
    async (req, res) => {
        try {
            const solicitud_id = Number(req.params.id);
            const admin_responsable_id = req.user.id;
            const { estado_solicitud, motivo_resolucion } = req.body;

            const result = await solicitudAccesoService.resolveSolicitud({
                solicitud_id,
                admin_responsable_id,
                estado_solicitud,
                motivo_resolucion,
            });

            res.json(result);
        } catch (e) {
            const code =
                e.code === "BAD_REQUEST"
                    ? 400
                    : e.code === "NOT_FOUND"
                        ? 404
                        : e.code === "STATE_ERROR"
                            ? 409
                            : 500;

            res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    }
);

export default solicitudAccesoRouter;
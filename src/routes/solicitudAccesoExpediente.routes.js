import { Router } from "express";
import { solicitudAccesoExpedienteService } from "../services/solicitudAccesoExpediente.service.js";
import { authGuard } from "../middleware/authGuard.js";
import { adminGuard } from "../middleware/adminGuard.js";

const router = Router();

router.post(
    "/expedientes/:expedienteId/solicitudes-acceso",
    authGuard,
    async (req, res) => {
        try {
            const usuario_solicitante_id = req.user.id;
            const expediente_id = Number(req.params.expedienteId);
            const { justificacion } = req.body;

            const result =
                await solicitudAccesoExpedienteService.createSolicitud({
                    justificacion,
                    usuario_solicitante_id,
                    expediente_id,
                });

            res.status(201).json(result);
        } catch (e) {
            const code =
                e.code === "BAD_REQUEST" ? 400 :
                    e.code === "NOT_FOUND" ? 404 :
                        e.code === "CONFLICT" ? 409 : 500;

            res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

router.get(
    "/mis-solicitudes-acceso-expediente",
    authGuard,
    async (req, res) => {
        try {
            const rows = await solicitudAccesoExpedienteService.listMisSolicitudes(req.user.id);
            res.json(rows);
        } catch (e) {
            res.status(500).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

router.get(
    "/solicitudes-acceso-expediente",
    authGuard,
    adminGuard,
    async (_req, res) => {
        try {
            const rows = await solicitudAccesoExpedienteService.listSolicitudes();
            res.json(rows);
        } catch (e) {
            res.status(500).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

router.get(
    "/solicitudes-acceso-expediente/:id",
    authGuard,
    adminGuard,
    async (req, res) => {
        try {
            const row = await solicitudAccesoExpedienteService.getSolicitudById(
                Number(req.params.id),
            );
            res.json(row);
        } catch (e) {
            const code = e.code === "NOT_FOUND" ? 404 : 500;
            res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

router.patch(
    "/solicitudes-acceso-expediente/:id/resolver",
    authGuard,
    adminGuard,
    async (req, res) => {
        try {
            const solicitud_id = Number(req.params.id);
            const admin_responsable_id = req.user.id;
            const { estado_solicitud, motivo_resolucion } = req.body;

            const result = await solicitudAccesoExpedienteService.resolveSolicitud({
                solicitud_id,
                admin_responsable_id,
                estado_solicitud,
                motivo_resolucion,
            });

            res.json(result);
        } catch (e) {
            const code =
                e.code === "BAD_REQUEST" ? 400 :
                    e.code === "NOT_FOUND" ? 404 :
                        e.code === "STATE_ERROR" ? 409 : 500;

            res.status(code).json({
                error: e.code ?? "internal_error",
                message: e.message,
            });
        }
    },
);

export default router;
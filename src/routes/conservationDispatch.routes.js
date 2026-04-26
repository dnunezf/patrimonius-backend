import { Router } from "express";
import { conservationDispatchController } from "../controllers/conservationDispatch.controller.js";

/**
 * Routes for HU-036 · Despacho de documentos por correo.
 * Mounted under /admin.
 */
export function buildConservationDispatchRoutes() {
    const router = Router();

    router.get(
        "/conservation/documents/:id/dispatch-email",
        conservationDispatchController.getDispatchDetail,
    );

    router.post(
        "/conservation/documents/:id/dispatch-email",
        conservationDispatchController.sendDispatchEmail,
    );

    router.get(
        "/conservation/documents/:id/dispatch-email/history",
        conservationDispatchController.listDispatchHistory,
    );

    return router;
}
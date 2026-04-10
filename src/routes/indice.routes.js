// src/routes/indice.routes.js
import { Router } from "express";
import { indiceService } from "../services/indice.service.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();
router.use(authGuard);

function mapStatus(error) {
    if (error?.code === 400) return 400;
    if (error?.code === 404) return 404;
    if (error?.code === 409) return 409;
    if (error?.code === 422) return 422;
    return 500;
}

// Cerrar expediente y generar índice electrónico
router.post("/cerrar-expediente/:expedienteId", async (req, res) => {
    try {
        const actor = req.actor ?? req.user ?? null;

        const result = await indiceService.cerrarExpediente(
            req.params.expedienteId,
            actor
        );

        return res.status(result.duplicated ? 200 : 201).json(result);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al cerrar el expediente y generar el índice",
            detail: error?.detail || null,
        });
    }
});

// Listar todos los índices
router.get("/", async (_req, res) => {
    try {
        const rows = await indiceService.list();
        return res.status(200).json(rows);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al obtener los índices electrónicos",
            detail: error?.detail || null,
        });
    }
});

// Obtener todos los índices de un expediente
router.get("/expediente/:expedienteId/lista", async (req, res) => {
    try {
        const rows = await indiceService.listByExpedienteId(req.params.expedienteId);
        return res.status(200).json(rows);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al obtener índices del expediente",
            detail: error?.detail || null,
        });
    }
});

// Obtener el índice más reciente de un expediente
router.get("/expediente/:expedienteId", async (req, res) => {
    try {
        const row = await indiceService.getByExpedienteId(req.params.expedienteId);
        return res.status(200).json(row);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al obtener el índice del expediente",
            detail: error?.detail || null,
        });
    }
});

// Obtener índice por id
router.get("/:id", async (req, res) => {
    try {
        const row = await indiceService.getById(req.params.id);
        return res.status(200).json(row);
    } catch (error) {
        return res.status(mapStatus(error)).json({
            error: error?.code || "internal_error",
            message: error?.message || "Error al obtener el índice electrónico",
            detail: error?.detail || null,
        });
    }
});

export { router };
export default router;
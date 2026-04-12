import { Router } from "express";
import { authGuard } from "../middleware/authGuard.js";
import { historialBusquedaService } from "../services/historialBusqueda.service.js";

const historialBusquedaRoutes = Router();

historialBusquedaRoutes.get("/historial-busquedas", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const limit = req.query.limit ?? 10;

        const rows = await historialBusquedaService.listarMiHistorial({
            usuario_id,
            limit,
        });

        res.json(rows);
    } catch (e) {
        res.status(500).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

historialBusquedaRoutes.delete("/historial-busquedas", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;

        const out = await historialBusquedaService.limpiarMiHistorial({
            usuario_id,
        });

        res.json(out);
    } catch (e) {
        res.status(500).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

historialBusquedaRoutes.delete("/historial-busquedas/:id", authGuard, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const historial_id = Number(req.params.id);

        const out = await historialBusquedaService.eliminarUnaBusqueda({
            usuario_id,
            historial_id,
        });

        res.json(out);
    } catch (e) {
        res.status(500).json({
            error: e.code ?? "internal_error",
            message: e.message,
        });
    }
});

export default historialBusquedaRoutes;
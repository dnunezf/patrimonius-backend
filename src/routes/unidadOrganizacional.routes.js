// src/routes/unidadOrganizacional.routes.js
import { Router } from "express";
import { authGuard } from "../middleware/authGuard.js";
import { unidadOrganizacionalService } from "../services/unidadOrganizacional.service.js";

const router = Router();

// Solo requiere usuario autenticado
router.get("/", authGuard, async (_req, res) => {
    try {
        const unidades = await unidadOrganizacionalService.getAll();
        return res.status(200).json(unidades);
    } catch (error) {
        console.error("GET /api/unidades error:", error);
        return res.status(500).json({ error: "internal_error", message: error.message });
    }
});

export default router;
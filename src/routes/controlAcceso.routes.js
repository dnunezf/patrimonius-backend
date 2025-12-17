// src/routes/controlAcceso.routes.js
import { Router } from "express";
import { getAccessControl } from "../services/controlAcceso.service.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();

router.get("/control-acceso", authGuard, async (req, res) => {
    try {
        console.log("✅ Entró a /documents/control-acceso", {
            query: req.query,
            user: req.user?.id,
        });

        const user = req.user;
        const data = await getAccessControl(user, req.query);
        res.json(data);
    } catch (err) {
        console.error("❌ Error en control de acceso:", err.message);
        res.status(500).json({
            error: "internal_error",
            message: "Error obteniendo control de acceso",
            detail: err.message,
        });
    }
});

export default router;

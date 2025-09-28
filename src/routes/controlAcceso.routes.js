import { Router } from "express";
import { getAccessControl } from "../services/controlAcceso.service.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();

// Protegida con JWT
router.get("/control-acceso", authGuard, async (req, res) => {
    try {
        const data = await getAccessControl(req.user);
        res.json(data);
    } catch (err) {
        if (err.message === "no_session") {
            return res.status(401).json({ error: "Debe iniciar sesión primero" });
        }
        console.error(err);
        res.status(500).json({ error: "Error obteniendo control de acceso" });
    }
});


export default router;

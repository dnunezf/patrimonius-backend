//src/routes/controlAcceso.routes.js
import { Router } from "express";
import { getAccessControl } from "../services/controlAcceso.service.js";
import { authGuard } from "../middleware/authGuard.js";

/**
 * Rutas de Control de Acceso (HU-003)
 * Integra HU-001, HU-004 y HU-005.
 */
const router = Router();

/**
 * ✅ GET /documents/control-acceso
 * Devuelve la matriz de documentos y permisos accesibles para el usuario autenticado.
 */
router.get("/control-acceso", authGuard, async (req, res) => {
    try {
        // 🔑 Obtenemos al usuario autenticado desde el token (authGuard)
        //const user = req.user;
        console.log("🧩 Authorization header recibido:", req.headers.authorization);
        console.log("🧩 Usuario del authGuard:", req.user);
        const user = req.user;

        // ⚙️ Si estás en desarrollo y aún no usás el login real,
        // podés usar este bloque temporal (elimínalo luego):
        /*
        const user = {
            id: 1,
            email: "admin@gmail.com",
            role: "ADMINISTRADOR",
            rolId: 1,
            unidadId: 1,
        };
        */

        const data = await getAccessControl(user);
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

// src/routes/controlAcceso.routes.js
import { Router } from "express";
import { getAccessControl } from "../services/controlAcceso.service.js";

const router = Router();

router.get("/control-acceso", async (req, res) => {
    try {
        // 🔥 Fake user quemado mientras se corrige login
        const fakeUser = {
            id: 1,
            email: "admin@gmail.com",
            role: "ADMINISTRADOR",
            rolId: 1,      // 👈 agregado
            unidadId: 1,   // 👈 ya estaba
        };

        const data = await getAccessControl(fakeUser);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error obteniendo control de acceso" });
    }
});

export default router;

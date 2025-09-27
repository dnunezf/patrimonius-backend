import express from "express";
import bcrypt from "bcryptjs";
import { jwtUtil } from "../utils/jwt.util.js";
import { userRepo } from "../repositories/userRepo.js";

const router = express.Router();

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Buscar usuario en la BD usando el nuevo método
        const user = await userRepo.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        // Validar contraseña
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        // Payload para token
        const payload = {
            id: user.id,
            email: user.email,
            rolId: user.rolId,
            unidadId: user.unidadId,
        };

        const token = jwtUtil.sign(payload);

        res.json({ token, user: payload });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "server_error" });
    }
});

export default router;

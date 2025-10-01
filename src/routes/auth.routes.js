import express from "express";
import bcrypt from "bcryptjs";
import { jwtUtil } from "../utils/jwt.util.js";
import { userRepo } from "../repositories/userRepo.js";
import { sendEmail } from "../utils/mailer.js";

const router = express.Router();

/**
 * POST /auth/login
 * Envía un código 2FA al correo si credenciales son correctas
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Buscar usuario en la BD
        const user = await userRepo.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        // Validar contraseña
        const valid = await bcrypt.compare(password, user.password || user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        // Generar código 2FA de 6 dígitos
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // válido 5 minutos

        // Guardar código en BD
        await userRepo.save2FACode(user.id, code, expiry);

        // Enviar email con el código
        await sendEmail(
            user.email,
            "Código de verificación Patrimonius",
            `Tu código de acceso es: ${code}`
        );

        res.json({
            message: "Se envió un código de verificación a tu correo",
            userId: user.id,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/verify-2fa
 * Verifica código 2FA y devuelve token JWT
 */
router.post("/verify-2fa", async (req, res) => {
    try {
        const { userId, code } = req.body;

        const user = await userRepo.findById(userId);

        if (
            !user ||
            user.last2FACode !== code ||
            new Date(user.last2FAExpiry) < new Date()
        ) {
            return res.status(401).json({ error: "Código inválido o vencido" });
        }

        // Limpiar código para que no se reutilice
        await userRepo.clear2FACode(userId);

        // Generar token final
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

/**
 * POST /auth/activate
 * Activa una cuenta con nueva contraseña usando token de correo
 */
router.post("/activate", async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: "invalid_request" });
        }

        // 1. Verificar token
        let payload;
        try {
            payload = jwtUtil.verify(token);
        } catch {
            return res.status(400).json({ error: "invalid_token" });
        }

        if (!payload || payload.action !== "activate") {
            return res.status(400).json({ error: "invalid_token" });
        }

        // 2. Buscar usuario
        const user = await userRepo.findById(payload.id);
        if (!user || !user.mustChangePassword) {
            return res.status(400).json({ error: "invalid_or_expired" });
        }

        // 3. Guardar nueva contraseña
        const hash = await bcrypt.hash(newPassword, 10);
        await userRepo.update(user.id, {
            password: hash,
            mustChangePassword: false,
        });

        res.json({ message: "Cuenta activada con éxito" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/resend-2fa
 * Reenvía un nuevo código 2FA al correo
 */
router.post("/resend-2fa", async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "invalid_request" });
        }

        // Buscar usuario
        const user = await userRepo.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        // Generar nuevo código 2FA
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // válido 5 minutos

        // Guardar en BD
        await userRepo.save2FACode(user.id, code, expiry);

        // Enviar correo
        await sendEmail(
            user.email,
            "Código de verificación Patrimonius",
            `Tu nuevo código de acceso es: ${code}`
        );

        res.json({ message: "Se envió un nuevo código de verificación a tu correo" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "server_error" });
    }
});

export default router;

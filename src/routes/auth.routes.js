import express from "express";
import bcrypt from "bcryptjs";
import { jwtUtil } from "../utils/jwt.util.js";
import { userRepo } from "../repositories/userRepo.js";
import { sendEmail } from "../utils/mailer.js";
import { masterConfig, safeEqual } from "../config/master.config.js";

const router = express.Router();
const TWO_FA_EXP_MINUTES = 5;

/**
 * POST /auth/login
 * Master bypass (sin 2FA) o inicio de 2FA para usuarios normales.
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({ error: "invalid_request" });
        }

        // 0) Master admin bypass (no 2FA)
        if (
            masterConfig.enabled &&
            safeEqual(email, masterConfig.email) &&
            safeEqual(password, masterConfig.password)
        ) {
            const payload = {
                id: 0,
                email: masterConfig.email,
                rolId: masterConfig.rolId,
                unidadId: masterConfig.unidadId,
                rolIds: [masterConfig.rolId],
                roles: ["ADMINISTRADOR"],
                isMaster: true,
            };
            const token = jwtUtil.sign(payload);
            return res.json({ token, user: payload, masterLogin: true });
        }

        // 1) Flujo normal con 2FA
        const user = await userRepo.findByEmail(email);
        if (!user) {
            return res
                .status(401)
                .json({ error: "Usuario o contraseña incorrectos" });
        }

        const valid = await bcrypt.compare(
            password,
            user.password || user.passwordHash || ""
        );
        if (!valid) {
            return res
                .status(401)
                .json({ error: "Usuario o contraseña incorrectos" });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiry = new Date(Date.now() + TWO_FA_EXP_MINUTES * 60 * 1000);

        await userRepo.save2FACode(user.id, code, expiry);

        const subject = "Código de verificación – Sistema Patrimonius MNCR";
        const body = `
Estimado(a) usuario(a),

Hemos recibido un intento de ingreso al Sistema Patrimonius del Museo Nacional de Costa Rica asociado a esta cuenta.

Su código de verificación es: ${code}
Vigencia del código: ${TWO_FA_EXP_MINUTES} minutos.

Si usted no ha intentado iniciar sesión, por favor ignore este mensaje.

Atentamente,
Sistema Patrimonius
Museo Nacional de Costa Rica
`.trim();

        await sendEmail(user.email, subject, body);

        return res.json({
            message:
                "Hemos enviado un código de verificación a su correo electrónico registrado. El código es válido por 5 minutos.",
            userId: user.id,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/verify-2fa
 * Verifica código 2FA y devuelve token JWT
 */
router.post("/verify-2fa", async (req, res) => {
    try {
        const { userId, code } = req.body || {};
        if (
            !Number.isInteger(Number(userId)) ||
            typeof code !== "string" ||
            !/^\d{6}$/.test(code)
        ) {
            return res.status(400).json({ error: "invalid_request" });
        }

        const user = await userRepo.findById(Number(userId));
        if (
            !user ||
            user.last2FACode !== code ||
            new Date(user.last2FAExpiry) < new Date()
        ) {
            return res.status(401).json({ error: "Código inválido o vencido" });
        }

        await userRepo.clear2FACode(Number(userId));
        const hydrated = await userRepo.findById(user.id);

        const payload = {
            id: hydrated.id,
            email: hydrated.email,
            rolId: hydrated.rolId,
            unidadId: hydrated.unidadId,
            rolIds: hydrated.rolIds ?? [],
            roles: hydrated.roles ?? [],
        };
        const token = jwtUtil.sign(payload);

        return res.json({ token, user: payload });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/activate
 * Activa una cuenta con nueva contraseña usando token de correo
 */
router.post("/activate", async (req, res) => {
    try {
        const { token, newPassword } = req.body || {};
        if (
            typeof token !== "string" ||
            typeof newPassword !== "string" ||
            newPassword.length < 6
        ) {
            return res.status(400).json({ error: "invalid_request" });
        }

        let payload;
        try {
            payload = jwtUtil.verify(token);
        } catch {
            return res.status(400).json({ error: "invalid_token" });
        }
        if (!payload || payload.action !== "activate") {
            return res.status(400).json({ error: "invalid_token" });
        }

        const user = await userRepo.findById(payload.id);
        if (!user || !user.mustChangePassword) {
            return res.status(400).json({ error: "invalid_or_expired" });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await userRepo.update(user.id, {
            password: hash,
            mustChangePassword: false,
        });

        return res.json({ message: "Cuenta activada con éxito" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/resend-2fa
 * Reenvía un nuevo código 2FA al correo
 */
router.post("/resend-2fa", async (req, res) => {
    try {
        const { userId } = req.body || {};
        if (!Number.isInteger(Number(userId))) {
            return res.status(400).json({ error: "invalid_request" });
        }

        const user = await userRepo.findById(Number(userId));
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiry = new Date(Date.now() + TWO_FA_EXP_MINUTES * 60 * 1000);

        await userRepo.save2FACode(user.id, code, expiry);

        const subject = "Nuevo código de verificación – Sistema Patrimonius MNCR";
        const body = `
Estimado(a) usuario(a),

Se ha generado un nuevo código de verificación para el ingreso al Sistema Patrimonius del Museo Nacional de Costa Rica.

Su nuevo código de verificación es: ${code}
Vigencia del código: ${TWO_FA_EXP_MINUTES} minutos.

El código anterior ha quedado invalidado.

Si usted no ha solicitado este código, por favor ignore este mensaje.

Atentamente,
Sistema Patrimonius
Museo Nacional de Costa Rica
`.trim();

        await sendEmail(user.email, subject, body);

        return res.json({
            message:
                "Se ha generado y enviado un nuevo código de verificación a su correo electrónico. El código anterior ha quedado invalidado.",
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

export default router;

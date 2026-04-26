//src/routes/auth.routes.js
import express from "express";
import bcrypt from "bcryptjs";
import { jwtUtil } from "../utils/jwt.util.js";
import { userRepo } from "../repositories/userRepo.js";
import { sendEmail } from "../utils/mailer.js";
import { masterConfig, safeEqual } from "../config/master.config.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";

import { refreshTokenRepo } from "../repositories/refreshTokenRepo.js";
import {
    generateRefreshToken,
    hashRefreshToken,
} from "../utils/refreshToken.util.js";

const router = express.Router();

const TWO_FA_EXP_MINUTES = 5;
const RESET_EXP_HOURS = 1;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

/**
 * POST /auth/login
 * Master bypass (sin 2FA) o inicio de 2FA para usuarios normales.
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const ip = req.ip;
        const userAgent = req.get("user-agent");

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "FALLO_LOGIN",
                result: "DENEGADO: invalid_request",
                ip,
                userAgent,
                detail: { email: email ?? null, path: req.originalUrl, method: req.method },
            });

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

            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "LOGIN",
                result: "PERMITIDO: master_bypass",
                ip,
                userAgent,
                detail: { email: masterConfig.email, isMaster: true },
            });

            return res.json({ token, user: payload, masterLogin: true });
        }

        // 1) Flujo normal con 2FA
        const user = await userRepo.findByEmail(email);

        if (!user) {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "FALLO_LOGIN",
                result: "DENEGADO: usuario_no_existe",
                ip,
                userAgent,
                detail: { email },
            });

            return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
        }

        const valid = await bcrypt.compare(password, user.password || user.passwordHash || "");

        if (!valid) {
            await bitacoraRepo.logSecurityEvent({
                actorId: user?.id ?? 0,
                tipo: "FALLO_LOGIN",
                result: "DENEGADO: password_incorrecto",
                ip,
                userAgent,
                detail: { email: user.email, userId: user.id },
            });

            return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiry = new Date(Date.now() + TWO_FA_EXP_MINUTES * 60 * 1000);

        await userRepo.save2FACode(user.id, code, expiry);

        await bitacoraRepo.logSecurityEvent({
            actorId: user.id,
            tipo: "LOGIN",
            result: "PERMITIDO: password_ok_2fa_enviado",
            ip,
            userAgent,
            detail: { email: user.email, userId: user.id },
        });

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

        try {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: server_error_login",
                ip: req.ip,
                userAgent: req.get("user-agent"),
                detail: { path: req.originalUrl, method: req.method, error: String(err?.message || err) },
            });
        } catch {}

        return res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/verify-2fa
 * Verifica código 2FA y devuelve token JWT + refresh token
 */
router.post("/verify-2fa", async (req, res) => {
    try {
        const { userId, code } = req.body || {};
        const ip = req.ip;
        const userAgent = req.get("user-agent");

        if (!Number.isInteger(Number(userId)) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
            await bitacoraRepo.logSecurityEvent({
                actorId: Number(userId) || 0,
                tipo: "AUTENTICACION",
                result: "DENEGADO: invalid_request",
                ip,
                userAgent,
                detail: {
                    userId,
                    codeProvided: typeof code === "string",
                    path: req.originalUrl,
                    method: req.method,
                },
            });

            return res.status(400).json({ error: "invalid_request" });
        }

        const user = await userRepo.findById(Number(userId));
        if (!user || user.last2FACode !== code || new Date(user.last2FAExpiry) < new Date()) {
            await bitacoraRepo.logSecurityEvent({
                actorId: Number(userId) || 0,
                tipo: "AUTENTICACION",
                result: "DENEGADO: codigo_invalido_o_vencido",
                ip,
                userAgent,
                detail: { userId: Number(userId) },
            });

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

        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);
        const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await refreshTokenRepo.create({
            usuario_id: hydrated.id,
            token_hash: refreshTokenHash,
            expires_at: refreshExpiresAt,
            user_agent: userAgent,
            ip,
        });

        await bitacoraRepo.logSecurityEvent({
            actorId: hydrated.id,
            tipo: "AUTENTICACION",
            result: "PERMITIDO: 2fa_ok",
            ip,
            userAgent,
            detail: { email: hydrated.email, rolId: hydrated.rolId, userId: hydrated.id },
        });

        return res.json({
            token,
            refreshToken,
            user: payload,
        });
    } catch (err) {
        console.error(err);

        try {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: server_error_verify_2fa",
                ip: req.ip,
                userAgent: req.get("user-agent"),
                detail: { path: req.originalUrl, method: req.method, error: String(err?.message || err) },
            });
        } catch {}

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
        const ip = req.ip;
        const userAgent = req.get("user-agent");

        if (typeof token !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: activate_invalid_request",
                ip,
                userAgent,
                detail: { path: req.originalUrl, method: req.method },
            });
            return res.status(400).json({ error: "invalid_request" });
        }

        let payload;
        try {
            payload = jwtUtil.verify(token);
        } catch {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: activate_invalid_token",
                ip,
                userAgent,
                detail: { path: req.originalUrl, method: req.method },
            });
            return res.status(400).json({ error: "invalid_token" });
        }

        if (!payload || payload.action !== "activate") {
            await bitacoraRepo.logSecurityEvent({
                actorId: payload?.id ?? 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: activate_wrong_action",
                ip,
                userAgent,
                detail: { action: payload?.action ?? null },
            });
            return res.status(400).json({ error: "invalid_token" });
        }

        const user = await userRepo.findById(payload.id);

        if (!user) {
            await bitacoraRepo.logSecurityEvent({
                actorId: payload.id,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: activate_user_not_found",
                ip,
                userAgent,
                detail: { userId: payload.id },
            });
            return res.status(400).json({ error: "invalid_or_expired" });
        }

        if (!user.mustChangePassword) {
            await bitacoraRepo.logSecurityEvent({
                actorId: user.id,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: already_activated",
                ip,
                userAgent,
                detail: { userId: user.id },
            });
            return res.status(400).json({ error: "already_activated" });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await userRepo.update(user.id, { password: hash, mustChangePassword: false });

        await bitacoraRepo.logSecurityEvent({
            actorId: user.id,
            tipo: "ACTIVIDAD_SEGURIDAD",
            result: "PERMITIDO: cuenta_activada",
            ip,
            userAgent,
            detail: { userId: user.id, email: user.email },
        });

        return res.json({
            message:
                "Su cuenta ha sido activada correctamente. Ya puede iniciar sesión en el Sistema Patrimonius del Museo Nacional de Costa Rica.",
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/request-password-reset
 * Inicia el flujo de restablecimiento de contraseña (envía correo con enlace)
 */
router.post("/request-password-reset", async (req, res) => {
    try {
        const { email } = req.body || {};
        const ip = req.ip;
        const userAgent = req.get("user-agent");

        if (typeof email !== "string" || !email.trim()) {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: reset_request_invalid_request",
                ip,
                userAgent,
                detail: { path: req.originalUrl, method: req.method },
            });
            return res.status(400).json({ error: "invalid_request" });
        }

        const user = await userRepo.findByEmail(email.trim());

        if (!user) {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "PERMITIDO: reset_requested",
                ip,
                userAgent,
                detail: { email: email.trim(), note: "user_not_found_or_hidden" },
            });

            return res.json({
                message:
                    "Si la dirección de correo corresponde a una cuenta registrada, se enviará un enlace para restablecer la contraseña.",
            });
        }

        const token = jwtUtil.sign(
            { id: user.id, action: "reset" },
            RESET_EXP_HOURS * 3600
        );

        const link = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

        const subject = "Restablecimiento de contraseña – Sistema Patrimonius MNCR";
        const body = `
Estimado(a) usuario(a),

Hemos recibido una solicitud para restablecer la contraseña de acceso al Sistema Patrimonius del Museo Nacional de Costa Rica.

Para definir una nueva contraseña, por favor ingrese al siguiente enlace:

${link}

Este enlace de restablecimiento tiene una vigencia de ${RESET_EXP_HOURS} hora(s).
Si usted no ha solicitado este cambio, puede ignorar este mensaje y su contraseña actual seguirá siendo válida.

Atentamente,
Sistema Patrimonius
Museo Nacional de Costa Rica
`.trim();

        await sendEmail(user.email, subject, body);

        await bitacoraRepo.logSecurityEvent({
            actorId: user.id,
            tipo: "ACTIVIDAD_SEGURIDAD",
            result: "PERMITIDO: reset_email_sent",
            ip,
            userAgent,
            detail: { userId: user.id, email: user.email },
        });

        return res.json({
            message:
                "Si la dirección de correo corresponde a una cuenta registrada, se enviará un enlace para restablecer la contraseña.",
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

/**
 * POST /auth/reset-password
 * Completa el restablecimiento de contraseña usando el token del correo
 */
router.post("/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body || {};
        const ip = req.ip;
        const userAgent = req.get("user-agent");

        if (typeof token !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: reset_invalid_request",
                ip,
                userAgent,
                detail: { path: req.originalUrl, method: req.method },
            });
            return res.status(400).json({ error: "invalid_request" });
        }

        let payload;
        try {
            payload = jwtUtil.verify(token);
        } catch {
            await bitacoraRepo.logSecurityEvent({
                actorId: 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: reset_invalid_token",
                ip,
                userAgent,
                detail: { path: req.originalUrl, method: req.method },
            });
            return res.status(400).json({ error: "invalid_token" });
        }

        if (!payload || payload.action !== "reset") {
            await bitacoraRepo.logSecurityEvent({
                actorId: payload?.id ?? 0,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: reset_wrong_action",
                ip,
                userAgent,
                detail: { action: payload?.action ?? null },
            });
            return res.status(400).json({ error: "invalid_token" });
        }

        const user = await userRepo.findById(payload.id);
        if (!user) {
            await bitacoraRepo.logSecurityEvent({
                actorId: payload.id,
                tipo: "ACTIVIDAD_SEGURIDAD",
                result: "DENEGADO: reset_user_not_found",
                ip,
                userAgent,
                detail: { userId: payload.id },
            });
            return res.status(400).json({ error: "invalid_or_expired" });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await userRepo.update(user.id, {
            password: hash,
            mustChangePassword: false,
        });

        await bitacoraRepo.logSecurityEvent({
            actorId: user.id,
            tipo: "ACTIVIDAD_SEGURIDAD",
            result: "PERMITIDO: password_reset_ok",
            ip,
            userAgent,
            detail: { userId: user.id, email: user.email },
        });

        return res.json({
            message:
                "Su contraseña ha sido restablecida correctamente. Ya puede iniciar sesión en el Sistema Patrimonius con su nueva contraseña.",
        });
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
        const ip = req.ip;
        const userAgent = req.get("user-agent");

        if (!Number.isInteger(Number(userId))) {
            await bitacoraRepo.logSecurityEvent({
                actorId: Number(userId) || 0,
                tipo: "AUTENTICACION",
                result: "DENEGADO: resend_2fa_invalid_request",
                ip,
                userAgent,
                detail: { userId, path: req.originalUrl, method: req.method },
            });

            return res.status(400).json({ error: "invalid_request" });
        }

        const user = await userRepo.findById(Number(userId));
        if (!user) {
            await bitacoraRepo.logSecurityEvent({
                actorId: Number(userId) || 0,
                tipo: "AUTENTICACION",
                result: "DENEGADO: usuario_no_encontrado",
                ip,
                userAgent,
                detail: { userId: Number(userId) },
            });

            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiry = new Date(Date.now() + TWO_FA_EXP_MINUTES * 60 * 1000);

        await userRepo.save2FACode(user.id, code, expiry);

        await bitacoraRepo.logSecurityEvent({
            actorId: user.id,
            tipo: "AUTENTICACION",
            result: "PERMITIDO: resend_2fa",
            ip,
            userAgent,
            detail: { userId: user.id, email: user.email },
        });

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

router.post("/refresh", async (req, res) => {
    try {
        const { refreshToken } = req.body || {};
        const ip = req.ip;
        const userAgent = req.get("user-agent");

        if (typeof refreshToken !== "string" || !refreshToken.trim()) {
            return res.status(400).json({ error: "invalid_request" });
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const stored = await refreshTokenRepo.findValidByHash(tokenHash);

        if (!stored) {
            return res.status(401).json({ error: "invalid_refresh_token" });
        }

        const user = await userRepo.findById(stored.usuario_id);
        if (!user) {
            return res.status(401).json({ error: "invalid_refresh_token" });
        }

        await refreshTokenRepo.revokeByHash(tokenHash);

        const payload = {
            id: user.id,
            email: user.email,
            rolId: user.rolId,
            unidadId: user.unidadId,
            rolIds: user.rolIds ?? [],
            roles: user.roles ?? [],
        };

        const newAccessToken = jwtUtil.sign(payload);

        const newRefreshToken = generateRefreshToken();
        const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
        const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await refreshTokenRepo.create({
            usuario_id: user.id,
            token_hash: newRefreshTokenHash,
            expires_at: refreshExpiresAt,
            user_agent: userAgent,
            ip,
        });

        return res.json({
            token: newAccessToken,
            refreshToken: newRefreshToken,
            user: payload,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

router.post("/logout", async (req, res) => {
    try {
        const { refreshToken } = req.body || {};

        if (typeof refreshToken === "string" && refreshToken.trim()) {
            const tokenHash = hashRefreshToken(refreshToken);
            await refreshTokenRepo.revokeByHash(tokenHash);
        }

        return res.json({ message: "logout_ok" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "server_error" });
    }
});

export default router;
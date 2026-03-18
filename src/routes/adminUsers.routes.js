// src/routes/adminUsers.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import {
    validate,
    createUserSchema,
    updateUserSchema,
} from "../utils/validator.js";
import { userService } from "../services/userService.js";
import { rolService } from "../services/rolService.js";
import { jwtUtil } from "../utils/jwt.util.js";
import { sendEmail } from "../utils/mailer.js";

export const adminUsers = Router();

// Constantes para activación de cuenta
const ACTIVATION_EXP_HOURS = 24;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

// Apply admin-only guard to every route under /admin/*
adminUsers.use(adminGuard);

/** Map DB/validation errors to HTTP status codes. */
function mapStatus(err) {
    if (err === 404 || err?.code === 404) return 404; // not found
    if (err === 400 || err?.code === 400) return 400; // bad request (manual)
    if (err?.code === 409) return 409; // conflict (ej. email_already_exists desde userRepo)
    if (err?.code === 422) return 422; // zod validation masked
    switch (err?.code) {
        case "ER_DUP_ENTRY": // unique key violation
            return 409;
        case "ER_NO_REFERENCED_ROW_2": // FK missing
            return 400;
        case "ER_ROW_IS_REFERENCED_2": // FK referenced
            return 409;
        default:
            return 500;
    }
}

/** Centralized error responder to avoid leaking field-level messages. */
function sendError(res, e) {
    const status = mapStatus(e);
    if (status === 422) {
        return res.status(422).json({ error: "invalid_request" });
    }
    if (status === 409) {
        return res.status(409).json({ error: "conflict" });
    }
    return res.status(status).json({ error: e.code || "internal_error" });
}

/** Create user with email activation link. */
adminUsers.post("/users", async (req, res) => {
    try {
        console.log("DEBUG: entrando a /admin/users con body:", req.body);

        const dto = validate(createUserSchema, req.body);

        // 🚀 Crear usuario con flag "mustChangePassword"
        const user = await userService.create(
            { ...dto, mustChangePassword: true, password: null },
            req.actor
        );
        console.log("DEBUG: usuario creado:", user);

        // 🚀 Generar token de activación (expira en 24h)
        const token = jwtUtil.sign(
            { id: user.id, action: "activate" },
            ACTIVATION_EXP_HOURS * 3600 // segundos
        );

        // 🚀 Armar link de activación usando FRONTEND_URL del .env
        const link = `${FRONTEND_URL}/activate?token=${encodeURIComponent(token)}`;
        console.log("DEBUG: link de activación generado:", link);

        // 🚀 Enviar correo de activación con tono institucional
        const subject = "Activación de cuenta – Sistema Patrimonius MNCR";
        const nombreMostrar = user.nombre || "usuario(a)";

        const body = `
Estimado(a) ${nombreMostrar},

Se ha creado una cuenta a su nombre en el Sistema Patrimonius del Museo Nacional de Costa Rica.

Para activar su cuenta y definir su contraseña, por favor ingrese al siguiente enlace:

${link}

Este enlace de activación tiene una vigencia de ${ACTIVATION_EXP_HOURS} horas. 
Transcurrido ese plazo, deberá solicitar un nuevo enlace de activación.

Si usted no reconoce esta solicitud, por favor ignore este mensaje.

Atentamente,
Sistema Patrimonius
Museo Nacional de Costa Rica
`.trim();

        res.status(201).json({
            message:
                "El usuario ha sido creado correctamente. Se ha enviado un correo de activación a la dirección de correo electrónico registrada.",
            user,
        });

        // Enviar correo en segundo plano para no bloquear la respuesta ni congelar la UI
        sendEmail(user.email, subject, body)
            .then(() =>
                console.log("DEBUG: correo de activación enviado correctamente")
            )
            .catch((err) =>
                console.error("ERROR enviando correo de activación:", err)
            );
    } catch (e) {
        console.error("ERROR en /admin/users:", e);
        sendError(res, e);
    }
});

/** List users for admin dashboard. */
adminUsers.get("/users", async (req, res) => {
    try {
        const search =
            typeof req.query.search === "string" ? req.query.search : "";
        const list = search
            ? await userService.search(search)
            : await userService.list();
        res.json(list);
    } catch (e) {
        sendError(res, e);
    }
});

/** Get roles (utility for frontend selects). */
adminUsers.get("/users/roles", async (_req, res) => {
    try {
        const roles = await rolService.getAllRoles();
        res.json(roles);
    } catch (e) {
        sendError(res, e);
    }
});


/** Patch user data and permissions. */
adminUsers.patch("/users/:id", async (req, res) => {
    try {
        const dto = validate(updateUserSchema, {
            ...req.body,
            id: Number(req.params.id),
        });
        const data = await userService.update(dto.id, dto, req.actor);
        res.json(data);
    } catch (e) {
        sendError(res, e);
    }
});

/** Delete user. */
adminUsers.delete("/users/:id", async (req, res) => {
    try {
        await userService.remove(Number(req.params.id), req.actor);
        res.status(204).send();
    } catch (e) {
        sendError(res, e);
    }
});

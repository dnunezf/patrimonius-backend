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

// Apply admin-only guard to every route under /admin/*
adminUsers.use(adminGuard);

/** Map DB/validation errors to HTTP status codes. */
function mapStatus(err) {
    if (err === 404 || err?.code === 404) return 404; // not found
    if (err === 400 || err?.code === 400) return 400; // bad request (manual)
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
            24 * 3600 // segundos
        );

        // 🚀 Armar link de activación usando FRONTEND_URL del .env
        const link = `${process.env.FRONTEND_URL}/activate?token=${token}`;
        console.log("DEBUG: link de activación generado:", link);

        // 🚀 Enviar correo
        console.log("DEBUG: enviando correo a", user.email);
        await sendEmail(
            user.email,
            "Activación de cuenta Patrimonius",
            `Hola ${user.nombre},\n\nSe ha creado tu usuario en Patrimonius.\nPor favor activa tu cuenta en el siguiente enlace (válido por 24h):\n\n${link}\n\nMuseo Nacional de Costa Rica`
        );
        console.log("DEBUG: correo enviado correctamente");

        res.status(201).json({
            message: "Usuario creado y correo de activación enviado",
            user,
        });
    } catch (e) {
        console.error("ERROR en /admin/users:", e);
        sendError(res, e);
    }
});


/** List users for admin dashboard. */
adminUsers.get("/users", async (req, res) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search : "";
        const list = search
            ? await userService.search(search)
            : await userService.list();
        res.json(list);
    } catch (e) {
        sendError(res, e);
    }
});

/** Get roles (utility for frontend selects). */
adminUsers.get("/roles", async (_req, res) => {
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

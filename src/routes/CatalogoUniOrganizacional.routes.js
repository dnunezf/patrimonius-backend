// src/routes/CatalogoUniOrganizacional.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { unidadService } from "../services/CatalogoUniOrganizacional.service.js";
import {authGuard} from "../middleware/authGuard.js";

export const adminUnidades = Router();

// 🔐 proteger todas las rutas
adminUnidades.use(authGuard);
adminUnidades.use(adminGuard);

/** Crear unidad organizacional */
adminUnidades.post("/unidades", async (req, res) => {
    try {
        const { nombre, descripcion } = req.body ?? {};

        // Validacion base
        if (!nombre?.trim()) {
            return res
                .status(400)
                .json({ error: "bad_request", message: "El nombre es obligatorio" });
        }

        // Actor autenticado (segun authGuard)
        const actor = req.actor ?? req.user;
        const usuarioId = actor?.id ?? null;

        if (usuarioId == null) { // acepta 0, solo bloquea null/undefined
            return res.status(401).json({ error: "unauthorized", message: "Usuario no autenticado" });
        }


        // Normalizar descripcion: permitir vacio -> null
        const desc =
            descripcion === undefined || descripcion === null
                ? null
                : String(descripcion).trim() || null;

        // Enviar al service (data + actor)
        const created = await unidadService.create(
            {
                nombre: nombre.trim(),
                descripcion: desc,
                usuarioId, // el repo lo usara para usuario_id
            },
            actor
        );

        return res.status(201).json(created);
    } catch (e) {
        console.error("POST /unidades error:", e);
        const code =
            e.code === "bad_request" ? 400 : e.code === "unauthorized" ? 401 : 500;

        return res.status(code).json({
            error: e.code || "internal_error",
            message: e.message,
        });
    }
});


/** Listar unidades organizacionales */
adminUnidades.get("/unidades", async (_req, res) => {
    try {
        const list = await unidadService.list();
        return res.json(list);
    } catch (e) {
        console.error("GET /unidades error:", e);
        return res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Actualizar (PATCH parcial) una unidad organizacional */
adminUnidades.patch("/unidades/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "bad_request", message: "ID inválido" });
        }

        // solo tomamos campos presentes (PATCH)
        const patch = {};
        if (req.body?.nombre !== undefined) patch.nombre = req.body.nombre?.trim();
        if (req.body?.descripcion !== undefined) patch.descripcion = req.body.descripcion;

        const updated = await unidadService.update(id, patch);
        if (!updated) {
            // servicio retorna null/undefined si no existe
            return res.status(404).json({ error: "not_found", message: "Unidad no encontrada" });
        }
        // 👉 devolvemos el objeto actualizado (como en plantillas)
        return res.json(updated);
    } catch (e) {
        console.error("PATCH /unidades/:id error:", e);
        const code = e.code === "bad_request" ? 400 : 500;
        return res.status(code).json({ error: e.code || "internal_error", message: e.message });
    }
});

/** Eliminar una unidad organizacional */
adminUnidades.delete("/unidades/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "bad_request", message: "ID inválido" });
        }

        const ok = await unidadService.remove(id, req.actor); // ✅ pasar actor
        if (!ok) {
            return res.status(404).json({ error: "not_found", message: "Unidad no encontrada" });
        }

        return res.status(204).send();
    } catch (e) {
        console.error("DELETE /unidades/:id error:", e);
        const code = e.code === "bad_request" ? 400 : (e.code === "not_found" ? 404 : 500);
        return res.status(code).json({ error: e.code || "internal_error", message: e.message });
    }
});


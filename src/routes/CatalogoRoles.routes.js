// src/routes/CatalogoRoles.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { roleService } from "../services/CatalogoRoles.service.js";

const mapStatus = (error) => {
    if (error?.code === "ER_DUP_ENTRY") return 409;
    if (error?.code === "BAD_REQUEST") return 400;
    if (error?.code === "NOT_FOUND") return 404;
    return 500;
};

export const adminRoles = Router();
adminRoles.use(adminGuard);

// Crear
adminRoles.post("/roles", async (req, res) => {
    try {
        const data = await roleService.create(req.body);
        res.status(201).json(data);
    } catch (e) {
        res.status(mapStatus(e)).json({ error: e.code || "internal_error", message: e.message });
    }
});

adminRoles.get("/roles", async (_req, res) => {
    console.log("[adminRoles] GET /admin/roles"); // 👈 LOG
    try {
        const list = await roleService.list();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});


// Actualizar
adminRoles.patch("/roles/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const data = await roleService.update(id, req.body);
        res.json(data);
    } catch (e) {
        res.status(mapStatus(e)).json({ error: e.code || "internal_error", message: e.message });
    }
});

// Eliminar
adminRoles.delete("/roles/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        await roleService.remove(id);
        res.status(204).send();
    } catch (e) {
        res.status(mapStatus(e)).json({ error: e.code || "internal_error", message: e.message });
    }
});

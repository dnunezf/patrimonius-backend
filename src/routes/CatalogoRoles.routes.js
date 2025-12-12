// src/routes/CatalogoRoles.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { roleService } from "../services/CatalogoRoles.service.js";

const mapStatus = (error) => {
    if (error?.code === "ER_DUP_ENTRY") return 409;
    if (error?.code === "CONFLICT") return 409;      // ✅ FK / rol en uso
    if (error?.code === "BAD_REQUEST") return 400;
    if (error?.code === "NOT_FOUND") return 404;
    return 500;
};

export const adminRoles = Router();

// proteger todas las rutas
adminRoles.use(adminGuard);

// Crear
adminRoles.post("/roles", async (req, res) => {
    try {
        const data = await roleService.create(req.body);
        return res.status(201).json(data);
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
            usage: e.meta ?? undefined,
        });
    }
});

// Listar
adminRoles.get("/roles", async (_req, res) => {
    console.log("[adminRoles] GET /admin/roles");
    try {
        const list = await roleService.list();
        return res.json(list);
    } catch (e) {
        return res.status(500).json({
            error: "internal_error",
            message: e.message,
        });
    }
});

// Actualizar
adminRoles.patch("/roles/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const data = await roleService.update(id, req.body);
        return res.json(data);
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
            usage: e.meta ?? undefined,
        });
    }
});

// Eliminar
adminRoles.delete("/roles/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        await roleService.remove(id);
        return res.status(204).send();
    } catch (e) {
        return res.status(mapStatus(e)).json({
            error: e.code || "internal_error",
            message: e.message,
            usage: e.meta ?? undefined,
        });
    }
});

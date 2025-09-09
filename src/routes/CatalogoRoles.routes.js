import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { roleService } from "../services/CatalogoRoles.service.js"; // Asegúrate de tener este servicio

export const adminRoles = Router();
adminRoles.use(adminGuard);

/** Create a new role */
adminRoles.post("/roles", async (req, res) => {
    try {
        const dto = req.body; // O valida como prefieras
        const data = await roleService.create(dto);
        res.status(201).json(data);
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

/** List all roles */
adminRoles.get("/roles", async (_req, res) => {
    try {
        const list = await roleService.list();
        res.json(list);
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

/** Update a role's data */
adminRoles.patch("/roles/:id", async (req, res) => {
    try {
        const dto = {
            ...req.body,
            id: Number(req.params.id),
        };
        const data = await roleService.update(dto.id, dto);
        res.json(data);
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

/** Delete a role */
adminRoles.delete("/roles/:id", async (req, res) => {
    try {
        await roleService.remove(Number(req.params.id));
        res.status(204).send();
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

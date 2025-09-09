import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { unidadService } from "../services/CatalogoUniOrganizacional.service.js"; // Asegúrate de tener este servicio

export const adminUnidades = Router();
adminUnidades.use(adminGuard);

/** Create a new unidad organizacional */
adminUnidades.post("/unidades", async (req, res) => {
    try {
        const dto = req.body; // O valida como prefieras
        const data = await unidadService.create(dto);
        res.status(201).json(data);
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

/** List all unidades organizacionales */
adminUnidades.get("/unidades", async (_req, res) => {
    try {
        const list = await unidadService.list();
        res.json(list);
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

/** Update a unidad organizacional */
adminUnidades.patch("/unidades/:id", async (req, res) => {
    try {
        const dto = {
            ...req.body,
            id: Number(req.params.id),
        };
        const data = await unidadService.update(dto.id, dto);
        res.json(data);
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

/** Delete a unidad organizacional */
adminUnidades.delete("/unidades/:id", async (req, res) => {
    try {
        await unidadService.remove(Number(req.params.id));
        res.status(204).send();
    } catch (e) {
        res
            .status(mapStatus(e))
            .json({ error: e.code || "internal_error", message: e.message });
    }
});

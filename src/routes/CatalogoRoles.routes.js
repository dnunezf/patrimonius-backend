// src/routes/CatalogoRoles.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { roleService } from "../services/CatalogoRoles.service.js";

// Mapeo de errores para retornar el código de estado correcto
const mapStatus = (error) => {
    if (error.code === "ER_DUP_ENTRY") return 409;  // Conflicto por duplicado (ej: intento de crear un rol con un nombre ya existente)
    if (error.code === "ER_BAD_FIELD_ERROR") return 400;  // Parámetro inválido
    if (error.code === "NOT_FOUND") return 404;  // No se encontró el recurso
    return 500;  // Si no se reconoce el error, se retorna un error interno por defecto
};

export const adminRoles = Router();
adminRoles.use(adminGuard);

// Crear un nuevo rol
adminRoles.post("/roles", async (req, res) => {
    try {
        const dto = req.body;
        const data = await roleService.create(dto);
        res.status(201).json(data); // Retorna el rol creado
    } catch (e) {
        res.status(mapStatus(e)).json({ error: e.code || "internal_error", message: e.message });
    }
});

// Listar todos los roles
adminRoles.get("/roles", async (_req, res) => {
    try {
        const list = await roleService.list();
        res.json(list); // Devuelve todos los roles
    } catch (e) {
        res.status(mapStatus(e)).json({ error: e.code || "internal_error", message: e.message });
    }
});

// Actualizar un rol
adminRoles.patch("/roles/:id", async (req, res) => {
    try {
        const dto = {
            ...req.body,
            id: Number(req.params.id),
        };
        const data = await roleService.update(dto.id, dto);
        res.json(data); // Devuelve el rol actualizado
    } catch (e) {
        res.status(mapStatus(e)).json({ error: e.code || "internal_error", message: e.message });
    }
});

// Eliminar un rol
adminRoles.delete("/roles/:id", async (req, res) => {
    try {
        await roleService.remove(Number(req.params.id));
        res.status(204).send(); // No retorna contenido, solo status 204
    } catch (e) {
        res.status(mapStatus(e)).json({ error: e.code || "internal_error", message: e.message });
    }
});

// src/routes/documento.routes.js
import { Router } from "express";
import { documentoService } from "../services/documento.service.js";

export const documentoRouter = Router();

/** Crear nuevo documento */
documentoRouter.post("/", async (req, res) => {
    try {
        const dto = req.body;
        const creado = await documentoService.create(dto);
        res.status(201).json(creado);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Obtener todos los documentos */
documentoRouter.get("/", async (_req, res) => {
    try {
        const list = await documentoService.list();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Obtener documento por ID */
documentoRouter.get("/:id", async (req, res) => {
    try {
        const doc = await documentoService.get(Number(req.params.id));
        res.json(doc);
    } catch (e) {
        res.status(e.code ?? 500).json({ error: e.message });
    }
});

/** Actualizar documento */
documentoRouter.patch("/:id", async (req, res) => {
    try {
        const updated = await documentoService.update(Number(req.params.id), req.body);
        res.json(updated);
    } catch (e) {
        res.status(e.code ?? 500).json({ error: e.message });
    }
});

/** Eliminar documento */
documentoRouter.delete("/:id", async (req, res) => {
    try {
        await documentoService.remove(Number(req.params.id));
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});
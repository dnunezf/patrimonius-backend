// src/routes/subserie.routes.js
import express from "express";
import { subserieService } from "../services/subserie.service.js";

const router = express.Router();

// Crear una nueva subserie
router.post("/", async (req, res) => {
    try {
        const { codigo, nombre, serie_id, descripcion } = req.body;
        const subserie = await subserieService.createSubserie({ codigo, nombre, serie_id, descripcion });
        return res.status(201).json(subserie);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

// Obtener todas las subseries sin importar la unidad organizacional
router.get("/", async (req, res) => {
    try {
        const wantsAll =
            String(req.query.all ?? "").trim() === "1" ||
            String(req.query.all ?? "").trim().toLowerCase() === "true";

        if (wantsAll) {
            const subseries = await subserieService.getAllSubseries();
            return res.status(200).json(subseries);
        }

        const unidadId = req.user?.unidad_id ?? req.user?.unidadId;

        if (!unidadId) {
            return res.status(400).json({
                error: "No se pudo determinar la unidad del usuario autenticado"
            });
        }

        const subseries = await subserieService.getSubseriesByUnidadId(Number(unidadId));
        return res.status(200).json(subseries);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

// Obtener subserie por ID
router.get("/:id", async (req, res) => {
    try {
        const subserie = await subserieService.getSubserieById(req.params.id);
        return res.status(200).json(subserie);
    } catch (error) {
        return res.status(404).json({ error: error.message });
    }
});

// Actualizar una subserie
router.put("/:id", async (req, res) => {
    try {
        const { codigo, nombre, serie_id, descripcion } = req.body;
        const updatedSubserie = await subserieService.updateSubserie(req.params.id, { codigo, nombre, serie_id, descripcion });
        return res.status(200).json(updatedSubserie);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

// Eliminar una subserie
router.delete("/:id", async (req, res) => {
    try {
        const result = await subserieService.deleteSubserie(req.params.id);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

export default router;
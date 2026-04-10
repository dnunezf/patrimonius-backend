// src/routes/serie.routes.js
import express from "express";
import { serieService } from "../services/serie.service.js";

const router = express.Router();

// Crear una nueva serie
router.post("/", async (req, res) => {
    try {
        const { codigo, nombre, unidad_id, descripcion } = req.body;
        const serie = await serieService.createSerie({ codigo, nombre, unidad_id, descripcion });
        return res.status(201).json(serie);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

// Obtener todas las series
router.get("/", async (req, res) => {
    try {
        const series = await serieService.getAllSeries();
        return res.status(200).json(series);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

// Obtener serie por ID
router.get("/:id", async (req, res) => {
    try {
        const serie = await serieService.getSerieById(req.params.id);
        return res.status(200).json(serie);
    } catch (error) {
        return res.status(404).json({ error: error.message });
    }
});

// Actualizar una serie
router.put("/:id", async (req, res) => {
    try {
        const { codigo, nombre, unidad_id, descripcion } = req.body;
        const updatedSerie = await serieService.updateSerie(req.params.id, { codigo, nombre, unidad_id, descripcion });
        return res.status(200).json(updatedSerie);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

// Eliminar una serie
router.delete("/:id", async (req, res) => {
    try {
        const result = await serieService.deleteSerie(req.params.id);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

export default router;
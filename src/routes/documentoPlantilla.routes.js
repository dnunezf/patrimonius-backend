// src/routes/documentoPlantilla.routes.js
import { Router } from "express";
import { documentoPlantillaService } from "../services/documentoPlantilla.service.js";

export const documentoPlantillaRouter = Router();

/** Vincular una plantilla a un documento */
documentoPlantillaRouter.post("/", async (req, res) => {
    try {
        const { documentoId, plantillaId } = req.body;
        if (!documentoId || !plantillaId) {
            return res.status(400).json({ error: "Faltan campos requeridos" });
        }

        await documentoPlantillaService.vincular(documentoId, plantillaId);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Desvincular una plantilla de un documento */
documentoPlantillaRouter.delete("/", async (req, res) => {
    try {
        const { documentoId, plantillaId } = req.body;
        if (!documentoId || !plantillaId) {
            return res.status(400).json({ error: "Faltan campos requeridos" });
        }

        await documentoPlantillaService.desvincular(documentoId, plantillaId);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Obtener todas las plantillas vinculadas a un documento */
documentoPlantillaRouter.get("/:documentoId", async (req, res) => {
    try {
        const documentoId = Number(req.params.documentoId);
        const plantillas = await documentoPlantillaService.obtenerPlantillas(documentoId);
        res.json(plantillas);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});
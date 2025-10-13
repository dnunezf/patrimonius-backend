// src/routes/Plantilla.routes.js
import { Router } from "express";
import { plantillaService } from "../services/plantilla.service.js";
import { upload } from "../middleware/cargaPlantillas.js"; // Si vas a subir archivos .docx

export const plantillaRouter = Router();

/** Crear plantilla */
plantillaRouter.post("/", upload.single("archivo"), async (req, res) => {
    try {
        const { nombre, descripcion, version } = req.body;
        const ruta_archivo = req.file?.path ?? null;

        if (!nombre || !version || !ruta_archivo) {
            return res.status(400).json({ error: "Faltan campos requeridos o archivo" });
        }

        const dto = { nombre, descripcion, version, ruta_archivo };
        const nueva = await plantillaService.create(dto);
        res.status(201).json(nueva);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Listar plantillas */
plantillaRouter.get("/", async (_req, res) => {
    try {
        const list = await plantillaService.list();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Obtener una plantilla por ID */
plantillaRouter.get("/:id", async (req, res) => {
    try {
        const plantilla = await plantillaService.get(Number(req.params.id));
        res.json(plantilla);
    } catch (e) {
        res.status(e.code ?? 500).json({ error: e.message });
    }
});

/** Actualizar plantilla */
plantillaRouter.patch("/:id", upload.single("archivo"), async (req, res) => {
    try {
        const { nombre, descripcion, version } = req.body;
        const ruta_archivo = req.file?.path;

        const dto = { nombre, descripcion, version, ruta_archivo };
        const updated = await plantillaService.update(Number(req.params.id), dto);
        res.json(updated);
    } catch (e) {
        res.status(e.code ?? 500).json({ error: e.message });
    }
});

/** Eliminar plantilla */
plantillaRouter.delete("/:id", async (req, res) => {
    try {
        await plantillaService.remove(Number(req.params.id));
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});
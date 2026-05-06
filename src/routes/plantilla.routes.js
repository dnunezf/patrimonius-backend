// src/routes/plantilla.routes.js
import { Router } from "express";
import { plantillaService } from "../services/plantilla.service.js";
import { upload } from "../middleware/cargaPlantillas.js";

const router = Router();

/** Crear plantilla (con archivo obligatorio) */
router.post("/", upload.single("archivo"), async (req, res) => {
    try {
        const { nombre, descripcion, version } = req.body;
        const filename = req.file?.filename || null;
        const ruta_archivo = filename ? `/plantillas/${filename}` : null;

        if (!nombre || !version || !ruta_archivo) {
            return res
                .status(400)
                .json({ error: "Faltan campos requeridos o archivo" });
        }

        const dto = { nombre, descripcion, version, ruta_archivo };
        const nueva = await plantillaService.create(dto);

        return res.status(201).json(nueva);
    } catch (e) {
        console.error("POST /plantillas", e);
        return res.status(500).json({
            error: "internal_error",
            message: e.message,
        });
    }
});

/** Listar plantillas */
router.get("/", async (_req, res) => {
    try {
        const list = await plantillaService.list();
        return res.json(list);
    } catch (e) {
        console.error("GET /plantillas", e);
        return res.status(500).json({
            error: "internal_error",
            message: e.message,
        });
    }
});

/**
 * Obtener una plantilla por ID.
 * Importante: solo acepta números para no chocar con archivos como /plantillas/oficio.docx
 */
router.get("/:id(\\d+)", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: "id_invalido" });
        }

        const plantilla = await plantillaService.get(id);
        return res.json(plantilla);
    } catch (e) {
        const status = e.code ?? 500;

        return res.status(status).json({
            error: e.message ?? "internal_error",
        });
    }
});

/**
 * Actualizar plantilla.
 * PATCH parcial, archivo opcional.
 * Importante: solo acepta ID numérico.
 */
router.patch("/:id(\\d+)", upload.single("archivo"), async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: "id_invalido" });
        }

        const dto = {};
        const { nombre, descripcion, version } = req.body;

        if (typeof nombre !== "undefined") {
            dto.nombre = nombre;
        }

        if (typeof descripcion !== "undefined") {
            dto.descripcion = descripcion;
        }

        if (typeof version !== "undefined") {
            dto.version = version;
        }

        if (req.file?.filename) {
            dto.ruta_archivo = `/plantillas/${req.file.filename}`;
        }

        const updated = await plantillaService.update(id, dto);

        return res.json(updated);
    } catch (e) {
        const status = e.code ?? 500;

        return res.status(status).json({
            error: e.message ?? "internal_error",
        });
    }
});

/**
 * Eliminar plantilla.
 * Importante: solo acepta ID numérico.
 */
router.delete("/:id(\\d+)", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: "id_invalido" });
        }

        await plantillaService.remove(id);

        return res.status(204).send();
    } catch (e) {
        console.error("DELETE /plantillas/:id", e);

        return res.status(500).json({
            error: "internal_error",
            message: e.message,
        });
    }
});

export const plantillaRouter = router;
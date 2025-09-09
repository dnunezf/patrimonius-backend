// src/routes/CatalogoPlantillas.routes.js
import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import { upload } from "../middleware/cargaPlantillas.js";  // Importa el middleware de carga de plantillas
import { plantillaService } from "../services/CatalogoPlantillas.service.js";
import mammoth from "mammoth";

export const catalogoPlantillas = Router();
catalogoPlantillas.use(adminGuard); // Protege las rutas con el guard de administrador

/** Subir una nueva plantilla (archivo Word) */
catalogoPlantillas.post("/plantillas", upload.single("plantilla"), async (req, res) => {
    try {
        const { file } = req;
        if (!file) {
            return res.status(400).json({ error: "No se ha cargado ningún archivo" });
        }

        // Procesar el archivo Word con Mammoth
        const filePath = file.path;
        const fileContent = await mammoth.extractRawText({ path: filePath });

        // Crea el objeto DTO para guardar en la base de datos
        const dto = {
            nombre: file.originalname,
            descripcion: fileContent.value,  // El contenido extraído del archivo Word
            ruta_archivo: filePath,
        };

        const data = await plantillaService.create(dto); // Usando el servicio para guardar la plantilla
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Listar todas las plantillas */
catalogoPlantillas.get("/plantillas", async (_req, res) => {
    try {
        const list = await plantillaService.list();  // Método para listar las plantillas
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Actualizar una plantilla */
catalogoPlantillas.patch("/plantillas/:id", async (req, res) => {
    try {
        const dto = {
            ...req.body,
            id: Number(req.params.id),
        };
        const data = await plantillaService.update(dto.id, dto); // Método para actualizar la plantilla
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

/** Eliminar una plantilla */
catalogoPlantillas.delete("/plantillas/:id", async (req, res) => {
    try {
        await plantillaService.remove(Number(req.params.id)); // Método para eliminar la plantilla
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: "internal_error", message: e.message });
    }
});

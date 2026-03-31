import { Router } from "express";
import { authGuard } from "../middleware/authGuard.js";
import { pool } from "../db/pool.js";
import CatalogoSerieRepo from "../repositories/CatalogoSerieRepo.js";
import CatalogoSubserieRepo from "../repositories/CatalogoSubserieRepo.js";
import { expedienteService } from "../services/expediente.service.js";

const router = Router();

router.use(authGuard);

/**
 * GET /carga-masiva/catalogos/unidades
 */
router.get("/carga-masiva/catalogos/unidades", async (_req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT
        id,
        nombre,
        descripcion
      FROM Unidad_Organizacional
      ORDER BY nombre ASC
    `);

        res.json(rows);
    } catch (error) {
        res.status(500).json({
            error: "internal_error",
            message: error.message || "Error al obtener unidades organizacionales",
        });
    }
});

/**
 * GET /carga-masiva/catalogos/series
 */
router.get("/carga-masiva/catalogos/series", async (_req, res) => {
    try {
        const rows = await CatalogoSerieRepo.getAll();
        res.json(rows);
    } catch (error) {
        res.status(500).json({
            error: "internal_error",
            message: error.message || "Error al obtener series",
        });
    }
});

/**
 * GET /carga-masiva/catalogos/subseries?serie_id=1
 */
router.get("/carga-masiva/catalogos/subseries", async (req, res) => {
    try {
        const serie_id = req.query?.serie_id ? Number(req.query.serie_id) : null;

        if (!serie_id) {
            return res.json([]);
        }

        const rows = await CatalogoSubserieRepo.getBySerieId(serie_id);
        res.json(rows);
    } catch (error) {
        res.status(500).json({
            error: "internal_error",
            message: error.message || "Error al obtener subseries",
        });
    }
});

/**
 * GET /carga-masiva/catalogos/expedientes?unidad_id=...&serie_id=...&subserie_id=...
 */
router.get("/carga-masiva/catalogos/expedientes", async (req, res) => {
    try {
        const data = await expedienteService.list(req.query);
        res.json(data);
    } catch (error) {
        res.status(
            error?.code === "BAD_REQUEST" ? 400 :
                error?.code === "NOT_FOUND" ? 404 :
                    error?.code === "CONFLICT" || error?.code === "ER_DUP_ENTRY" ? 409 : 500
        ).json({
            error: "internal_error",
            message: error.message || "Error al obtener expedientes",
        });
    }
});

/**
 * GET /carga-masiva/catalogos/niveles-acceso
 * Se centraliza en backend aunque sea estático.
 */
router.get("/carga-masiva/catalogos/niveles-acceso", async (_req, res) => {
    try {
        res.json([
            { value: "PUBLIC", label: "Público" },
            { value: "INTERNAL", label: "Interno" },
            { value: "HIGH", label: "Alto" },
            { value: "RESTRICTED", label: "Restringido" },
        ]);
    } catch (error) {
        res.status(500).json({
            error: "internal_error",
            message: "Error al obtener niveles de acceso",
        });
    }
});

export default router;
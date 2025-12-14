// ============================
// src/app.js
// ============================

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pino from "pino";
import cors from "cors";
import path from "path";

// Rutas / middlewares
import { adminUsers } from "./routes/adminUsers.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { authGuard } from "./middleware/authGuard.js";
import { healthRoutes } from "./routes/health.routes.js";
import auditRouter from "./routes/audit.routes.js";
import { categoriaRouter } from "./routes/categoria.routes.js";
import documentoRoutes from "./routes/documento.routes.js";
import permissionRouter from "./routes/permission.routes.js";
import accessRoutes from "./routes/access.routes.js";
import { adminConfidentiality } from "./routes/adminConfidentiality.routes.js";
import { adminUnidades } from "./routes/CatalogoUniOrganizacional.routes.js";
import { catalogoPlantillas } from "./routes/CatalagoPlantillas.routes.js";
import controlAccesoRoutes from "./routes/controlAcceso.routes.js";
import { documentMetadataRoutes } from "./routes/documentMetadata.routes.js";
import { plantillaRouter } from "./routes/plantilla.routes.js";
import unitsRoutes from "./routes/units.routes.js";
import { syncPlantillasFromFolder } from "./services/plantilla.sync.js";
import { adminRoles } from "./routes/CatalogoRoles.routes.js"; // ✅ ÚNICO router de roles

export const app = express();
export const logger = pino();

// Body / CORS
app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Static de plantillas
const PLANTILLAS_DIR = path.join(process.cwd(), "src", "assets", "Plantillas");
app.use("/plantillas", express.static(PLANTILLAS_DIR));

// Rutas públicas
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

// Rutas protegidas (/admin/*)
app.use(
    "/admin",
    authGuard,
    adminUsers,
    adminRoles,          // ✅ /admin/roles (GET/POST/PATCH/DELETE)
    adminUnidades,       // /admin/unidades
    catalogoPlantillas,  // /admin/plantillas (si aplica)
    adminConfidentiality
);

// Si unitsRoutes también es admin, protégelo
app.use("/admin", authGuard, unitsRoutes);

// Otros módulos
app.use("/audit", auditRouter);
app.use("/access", accessRoutes);
app.use("/categorias", categoriaRouter);
app.use("/plantillas", plantillaRouter); // CRUD plantillas públicas
app.use("/", documentoRoutes);
app.use("/documents", controlAccesoRoutes);
app.use("/", documentMetadataRoutes);
app.use("/permissions", permissionRouter);

// Seed/Sync de plantillas (opcional)
if (process.env.SEED_PLANTILLAS === "true") {
    (async () => {
        try {
            const res = await syncPlantillasFromFolder(PLANTILLAS_DIR);
            logger.info({ msg: "Sync plantillas (startup)", ...res });
        } catch (e) {
            logger.error({ msg: "Sync plantillas failed", error: e?.message });
        }
    })();
}

// Manejo de errores global
app.use((err, _req, res, _next) => {
    logger.error(err);
    res.status(500).json({ error: "internal_error" });
});

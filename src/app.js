// ============================
// src/app.js
// ============================

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pino from "pino";
import cors from "cors";
import path from "path";

// DB + audit (FIX for "pool is not defined")
import { pool } from "./db/pool.js";
import { bitacoraRepo } from "./repositories/bitacoraRepo.js";

// Guards (FIX: adminGuard was used but not imported)
import { authGuard } from "./middleware/authGuard.js";
import { adminGuard } from "./middleware/adminGuard.js";

// Routes / modules
import { adminUsers } from "./routes/adminUsers.routes.js";
import authRoutes from "./routes/auth.routes.js";
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
import { adminRoles } from "./routes/CatalogoRoles.routes.js";
import comentariosRoutes from "./routes/comentarios.routes.js";
import { adminConfidentialityDocs } from "./routes/adminConfidentiality.documents.routes.js";

// HU-002 new routes builder (if you are using the unified builder)
import { buildConfidentialityRoutes } from "./routes/confidentiality.routes.js";

// HU-002 repo/service
import { ConfidentialityRepo } from "./repositories/confidentiality.repo.js";
import { ConfidentialityService } from "./services/confidentiality.service.js";

export const app = express();
export const logger = pino();

// ============================
// HU-002 wiring (FIX: pool/bitacoraRepo undefined)
// ============================
const confRepo = new ConfidentialityRepo(pool);

const confService = new ConfidentialityService({
  pool,
  repo: confRepo,
  bitacoraRepo, // uses SYSTEM_USER_ID fallback inside repo functions if needed
});

// ============================
// Body / CORS
// ============================
app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Static templates
const PLANTILLAS_DIR = path.join(process.cwd(), "src", "assets", "Plantillas");
app.use("/plantillas", express.static(PLANTILLAS_DIR));

// ============================
// Public routes
// ============================
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

// ============================
// Protected admin routes
// ============================
app.use(
  "/admin",
  authGuard,
  adminUsers,
  adminRoles,
  adminUnidades,
  catalogoPlantillas,
  adminConfidentiality,
  adminConfidentialityDocs
);

// If unitsRoutes is admin-only
app.use("/admin", authGuard, unitsRoutes);

/**
 * HU-002 unified confidentiality routes
 * NOTE:
 * - This mounts additional HU-002 routes under /admin.
 * - If `adminConfidentiality` already defines the same paths (e.g. /confidentiality/docs/:id),
 *   keep only ONE of them to avoid duplicate route registration.
 */
app.use(
  "/admin",
  buildConfidentialityRoutes({
    authGuard, // not strictly needed here because /admin already has authGuard, but kept for compatibility
    adminGuard,
    confidentialityService: confService,
  })
);

// ============================
// Other modules
// ============================
app.use("/audit", auditRouter);
app.use("/access", accessRoutes);
app.use("/categorias", categoriaRouter);

app.use("/plantillas", plantillaRouter); // public CRUD if applicable
app.use("/", comentariosRoutes);

// IMPORTANT: mount /documents BEFORE documentoRoutes to avoid collisions
app.use("/documents", controlAccesoRoutes);

// General document routes
app.use("/", documentoRoutes);
app.use("/", documentMetadataRoutes);

// Permissions (protected)
app.use("/permissions", authGuard, permissionRouter);

// ============================
// Optional template seed/sync
// ============================
if (process.env.SEED_PLANTILLAS === "true") {
  (async () => {
    try {
      const res = await syncPlantillasFromFolder(PLANTILLAS_DIR);
      logger.info({ msg: "Sync templates (startup)", ...res });
    } catch (e) {
      logger.error({ msg: "Sync templates failed", error: e?.message });
    }
  })();
}

// ============================
// Global error handler
// ============================
app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: "internal_error" });
});

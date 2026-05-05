// ============================
// src/app.js in PRODUCTION
// ============================
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pino from "pino";
import cors from "cors";
import path from "path";

import { pool } from "./db/pool.js";
import { bitacoraRepo } from "./repositories/bitacoraRepo.js";

// Routes / middlewares
import { adminUsers } from "./routes/adminUsers.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { authGuard } from "./middleware/authGuard.js";
import { adminGuard } from "./middleware/adminGuard.js";
import { auditArchivistaGuard } from "./middleware/auditArchivistaGuard.js";
import { archivoGuard } from "./middleware/archivoGuard.js";
import { healthRoutes } from "./routes/health.routes.js";
import auditRouter from "./routes/audit.routes.js";
import { categoriaRouter } from "./routes/categoria.routes.js";
import documentoRoutes from "./routes/documento.routes.js";
import permissionRouter from "./routes/permission.routes.js";
import accessRoutes from "./routes/access.routes.js";
import { adminUnidades } from "./routes/CatalogoUniOrganizacional.routes.js";
import { catalogoPlantillas } from "./routes/CatalagoPlantillas.routes.js";
import controlAccesoRoutes from "./routes/controlAcceso.routes.js";
import { documentMetadataRoutes } from "./routes/documentMetadata.routes.js";
import { plantillaRouter } from "./routes/plantilla.routes.js";
import unitsRoutes from "./routes/units.routes.js";
import { syncPlantillasFromFolder } from "./services/plantilla.sync.js";
import { adminRoles } from "./routes/CatalogoRoles.routes.js";
import comentariosRoutes from "./routes/comentarios.routes.js";
import { notificacionRouter } from "./routes/notificacion.routes.js";
import firmaRoutes from "./routes/firma.routes.js";
import cargaMasivaCatalogosRoutes from "./routes/cargaMasiva.catalogos.routes.js";
import historialBusquedaRoutes from "./routes/historialBusqueda.routes.js";

// ===== Nuevas rutas =====
import serieRouter from "./routes/CatalogoSerie.routes.js";
import subserieRouter from "./routes/CatalogoSubserie.routes.js";
import expedienteRouter from "./routes/expediente.routes.js";
import unidadOrganizacionalRoutes from "./routes/unidadOrganizacional.routes.js";

// HU-002 canonical routes
import { buildConfidentialityRoutes } from "./routes/confidentiality.routes.js";
import { ConfidentialityRepo } from "./repositories/confidentiality.repo.js";
import { ConfidentialityService } from "./services/confidentiality.service.js";

import { buildConservationIntakeRoutes } from "./routes/conservationIntake.routes.js";

// HU-023 Creación de índices electrónicos
import indiceRouter from "./routes/indice.routes.js";
import serieRoutes from "./routes/serie.routes.js";
import subserieRoutes from "./routes/subserie.routes.js";

// HU-024 y HU-025
import solicitudAccesoRouter from "./routes/solicitudAcceso.routes.js";
import solicitudAccesoExpedienteRouter from "./routes/solicitudAccesoExpediente.routes.js";

import gestionPlazosRouter from "./routes/gestionPlazos.routes.js";

import { buildConservationDispatchRoutes } from "./routes/conservationDispatch.routes.js";

export const app = express();
export const logger = pino();

// HU-002 service wiring
const confRepo = new ConfidentialityRepo(pool);
const confService = new ConfidentialityService({
  pool,
  repo: confRepo,
  bitacoraRepo,
});

function normalizeRoleName(value) {
  return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
}

function extractRoleNames(actor) {
  const rawRoles = actor?.roles;
  const values = [];

  if (Array.isArray(rawRoles)) {
    values.push(...rawRoles);
  } else if (typeof rawRoles === "string" && rawRoles.trim()) {
    values.push(...rawRoles.split(","));
  }

  values.push(actor?.role, actor?.rol, actor?.roleName);

  return Array.from(new Set(values.map(normalizeRoleName).filter(Boolean)));
}

function extractRoleIds(actor) {
  const ids = [];

  if (Array.isArray(actor?.rolIds)) ids.push(...actor.rolIds);
  if (Array.isArray(actor?.roleIds)) ids.push(...actor.roleIds);

  ids.push(actor?.rolId, actor?.roleId);

  return Array.from(
      new Set(ids.map((value) => Number(value)).filter(Number.isFinite)),
  );
}

function canAccessConservationModule(actor) {
  const roleNames = extractRoleNames(actor);
  const roleIds = extractRoleIds(actor);

  return (
      roleIds.includes(2) ||
      roleIds.includes(3) ||
      roleNames.includes("EDITOR") ||
      roleNames.includes("ARCHIVADOR") ||
      roleNames.includes("ARCHIVISTA")
  );
}

function conservationModuleGuard(req, res, next) {
  const actor = req.actor || req.user;
  const actorId = Number(actor?.id || actor?.userId || actor?.usuario_id || 0);

  if (!actorId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Unauthorized",
    });
  }

  if (!canAccessConservationModule(actor)) {
    return res.status(403).json({
      error: "forbidden",
      message:
          "No tiene permisos para acceder al módulo de Ingreso a Conservación.",
    });
  }

  return next();
}

// Body / CORS
app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// ============================
// RUTAS ADMIN GENERALES
// ============================
// IMPORTANTE:
// Estas rutas deben ir ANTES del conservationModuleGuard,
// porque /admin/roles, /admin/units y /admin/users son rutas administrativas.
// Si conservationModuleGuard va primero, bloquea al administrador con 403.
app.use(
    "/admin",
    authGuard,
    adminUsers,
    adminRoles,
    adminUnidades,
    catalogoPlantillas,
);

// Si unitsRoutes también es admin-protected
app.use("/admin", authGuard, unitsRoutes);

// HU-002 confidencialidad: solo administrador.
app.use(
    "/admin",
    authGuard,
    adminGuard,
    buildConfidentialityRoutes({ confidentialityService: confService }),
);

// ============================
// RUTAS DE CONSERVACIÓN
// ============================
// Acceso permitido únicamente para Editor y Archivista.
// No debe bloquear /admin/users, /admin/roles ni /admin/units.
app.use(
    "/admin",
    authGuard,
    conservationModuleGuard,
    buildConservationIntakeRoutes(),
    buildConservationDispatchRoutes(),
);

// ============================
// GESTIÓN DE PLAZOS
// ============================
app.use("/gestion-plazos", gestionPlazosRouter);

// ===== API ADMIN separada del frontend =====
app.use("/api/admin/series", authGuard, archivoGuard, serieRouter);
app.use("/api/admin/subseries", authGuard, archivoGuard, subserieRouter);
app.use("/api/admin/expedientes", authGuard, archivoGuard, expedienteRouter);
app.use("/api/expedientes", authGuard, expedienteRouter);

// Auditoría: JWT + admin/archivista/isMaster; rutas /security/* exigen admin en el router
app.use("/audit", authGuard, auditArchivistaGuard, auditRouter);
app.use("/access", accessRoutes);
app.use("/categorias", categoriaRouter);
app.use("/api/firma", firmaRoutes);
app.use("/", comentariosRoutes);

app.use("/indices", indiceRouter);
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use("/api/series", authGuard, serieRoutes);
app.use("/subseries", authGuard, subserieRoutes);
app.use("/api/unidades", unidadOrganizacionalRoutes);

// Static plantillas
const PLANTILLAS_DIR = path.join(process.cwd(), "src", "assets", "Plantillas");
app.use("/plantillas", express.static(PLANTILLAS_DIR));

// Public routes
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

// IMPORTANT: /documents before documentoRoutes
app.use("/documents", controlAccesoRoutes);
app.use("/", documentoRoutes);
app.use("/", solicitudAccesoRouter);
app.use("/", solicitudAccesoExpedienteRouter);
app.use("/", documentMetadataRoutes);
app.use("/", historialBusquedaRoutes);

app.use("/permissions", authGuard, permissionRouter);
app.use("/notificacion", authGuard, notificacionRouter);

app.use("/api", cargaMasivaCatalogosRoutes);

// Optional startup sync
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

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: "internal_error" });
});
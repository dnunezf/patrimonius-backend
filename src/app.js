import express from "express";
import pino from "pino";
import cors from "cors";
import { adminUsers } from "./routes/adminUsers.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { authGuard } from "./middleware/authGuard.js";
import { healthRoutes } from "./routes/health.routes.js";
import auditRouter from "./routes/audit.routes.js";
import rolRoutes from './routes/rol.routes.js';
import { categoriaRouter } from './routes/categoria.routes.js';
import documentoRoutes from "./routes/documento.routes.js";
import permissionRouter from "./routes/permission.routes.js";
import accessRoutes from "./routes/access.routes.js";
import { adminConfidentiality } from "./routes/adminConfidentiality.routes.js";

import dotenv from "dotenv";
import {adminRoles} from "./routes/CatalogoRoles.routes.js";
import {adminUnidades} from "./routes/CatalogoUniOrganizacional.routes.js";
import {catalogoPlantillas} from "./routes/CatalagoPlantillas.routes.js";
import controlAccesoRoutes from "./routes/controlAcceso.routes.js";
import {plantillaRouter} from "./routes/plantilla.routes.js";
dotenv.config();

export const app = express();
export const logger = pino();

app.use(cors());
app.use(express.json());


// Rutas de health check
app.use("/health", healthRoutes);

// Rutas públicas
app.use("/auth", authRoutes);

// Rutas protegidas
app.use("/admin", authGuard, adminUsers,adminRoles,adminUnidades,catalogoPlantillas);
app.use("/admin", authGuard, adminConfidentiality);

app.use("/audit", auditRouter);

app.use("/access", accessRoutes);


// Global error handler LAST
app.use('/rol', rolRoutes);

app.use('/categorias', categoriaRouter);

app.use("/documents", documentoRoutes);

app.use("/plantillas", plantillaRouter);

app.use("/documents", controlAccesoRoutes);

app.use('/permissions', permissionRouter);

// Manejo de errores global
app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: "internal_error" });
});

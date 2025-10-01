// ⬇️ 1) .env primero
import dotenv from "dotenv";
dotenv.config();

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
import {adminRoles} from "./routes/CatalogoRoles.routes.js";
import {adminUnidades} from "./routes/CatalogoUniOrganizacional.routes.js";
import {catalogoPlantillas} from "./routes/CatalagoPlantillas.routes.js";
import controlAccesoRoutes from "./routes/controlAcceso.routes.js";

export const app = express();
export const logger = pino();

app.use(cors());
app.use(express.json());

// Rutas públicas
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

// Rutas protegidas
app.use("/admin", authGuard, adminUsers, adminRoles, adminUnidades, catalogoPlantillas);
app.use("/admin", authGuard, adminConfidentiality);
app.use("/audit", auditRouter);
app.use("/access", accessRoutes);
app.use('/rol', rolRoutes);
app.use('/categorias', categoriaRouter);

// ⬇️ 2) montar documentoRoutes en raíz para respetar tus paths internos
app.use("/", documentoRoutes);
app.use("/documents", controlAccesoRoutes);

app.use('/permissions', permissionRouter);

// Manejo de errores global
app.use((err, _req, res, _next) => {
    logger.error(err);
    res.status(500).json({ error: "internal_error" });
});

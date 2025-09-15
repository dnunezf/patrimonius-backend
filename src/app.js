import express from "express";
import pino from "pino";
import cors from "cors";
import { adminUsers } from "./routes/adminUsers.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { authGuard } from "./middleware/authGuard.js";
import { healthRoutes } from "./routes/health.routes.js";
import auditRouter from "./routes/audit.routes.js";

import dotenv from "dotenv";
import {adminRoles} from "./routes/CatalogoRoles.routes.js";
import {adminUnidades} from "./routes/CatalogoUniOrganizacional.routes.js";
import {catalogoPlantillas} from "./routes/CatalagoPlantillas.routes.js";
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

app.use("/audit", auditRouter);

// Manejo de errores global
app.use((err, _req, res, _next) => {
    logger.error(err);
    res.status(500).json({ error: "internal_error" });
});

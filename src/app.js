import express from "express";
import pino from "pino";
import cors from "cors";
import { adminUsers } from "./routes/adminUsers.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { authGuard } from "./middleware/authGuard.js";
import { healthRoutes } from "./routes/health.routes.js";
import auditRouter from "./routes/audit.routes.js";
import rolRoutes from './routes/rol.routes.js';
import { categoriaRouter } from './routes/categoria.routes.js';
import  documentoRoutes  from "./routes/documento.routes.js";

import dotenv from "dotenv";
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
app.use("/admin", authGuard, adminUsers);

app.use("/audit", auditRouter);

app.use('/rol', rolRoutes);

app.use('/categorias', categoriaRouter);

app.use("/documents", documentoRoutes);

// Manejo de errores global
app.use((err, _req, res, _next) => {
    logger.error(err);
    res.status(500).json({ error: "internal_error" });
});

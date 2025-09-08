import express from "express";
import pino from "pino";
import cors from "cors";
import { adminUsers } from "./routes/adminUsers.routes.js";

export const app = express();
export const logger = pino();

app.use(cors());
app.use(express.json());

app.use("/admin", adminUsers);

app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: "internal_error" });
});

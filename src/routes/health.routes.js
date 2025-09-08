
import { Router } from "express";
import { pool } from "../db/pool.js";

export const healthRoutes = Router();

healthRoutes.get("/db", async (_req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS ok");
        res.json({ db: "up", rows });
    } catch (e) {
        res.status(500).json({ db: "down", message: e.message, code: e.code });
    }
});

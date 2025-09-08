
import { Router } from "express";
import { authService } from "../services/authService.js";

export const authRoutes = Router();

authRoutes.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip = req.ip;
        const userAgent = req.headers["user-agent"];
        const data = await authService.login(email, password, ip, userAgent);
        res.json(data);
    } catch (e) {
        res.status(401).json({ error: "invalid_credentials", message: e.message });
    }
});


import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

export async function authGuard(req, res, next) {
    // Re-read env each call to avoid stale value in hot reload/tests
    const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

    if (SKIP_AUTH) {
        req.user = {
            id: 0,
            email: "dev@local",
            role: "Administrador",
            rolId: 1,
            unidadId: 1,
            unidadNombre: "UO_JUNTA_ADMINISTRATIVA" // 🚀 unidad fake en modo dev
        };
        req.actor = { id: 0, email: "dev@local" };
        return next();
    }

    const auth = req.headers.authorization || "";
    const [scheme, token] = auth.split(" ");
    if (!/^Bearer$/i.test(scheme) || !token) {
        return res
            .status(401)
            .json({ error: "no_session", message: "Debe iniciar sesión primero" });
    }

    try {
        const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });

        // 🚀 Refrescar datos desde BD para garantizar rol y unidad
        const [rows] = await pool.execute(
            `SELECT u.id,
                    u.email,
                    u.rol_id       AS rolId,
                    u.unidad_id    AS unidadId,
                    r.nombre       AS role,
                    un.nombre      AS unidadNombre
             FROM Usuario u
                      JOIN Rol r ON u.rol_id = r.id
                      JOIN Unidad_Organizacional un ON u.unidad_id = un.id
             WHERE u.id = ?`,
            [payload.id]
        );

        if (!rows.length) {
            return res.status(401).json({ error: "user_not_found" });
        }

        const user = rows[0];

        // Normalización de campos
        req.user = {
            id: user.id,
            email: user.email,
            rolId: user.rolId,
            role: user.role,
            unidadId: user.unidadId,
            unidadNombre: user.unidadNombre // 🚀 ya disponible en frontend
        };

        req.actor = { id: user.id, email: user.email };

        return next();
    } catch (err) {
        console.error("JWT error:", err.message);
        return res.status(401).json({ error: "invalid_token" });
    }
}

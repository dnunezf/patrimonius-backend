import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

export async function authGuard(req, res, next) {
    const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

    if (SKIP_AUTH) {
        req.user = {
            id: 0,
            email: "dev@local",
            role: "Administrador",
            rolId: 1,
            unidadId: 1,
            unidadNombre: "UO_JUNTA_ADMINISTRATIVA"
        };
        req.actor = { id: 0, email: "dev@local" };
        return next();
    }

    const auth = req.headers.authorization || "";
    const [scheme, token] = auth.split(" ");

    try {
        let user;

        if (/^Bearer$/i.test(scheme) && token) {
            // 🚀 Caso con JWT válido
            const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });

            const [rows] = await pool.execute(
                `SELECT u.id,
                u.email,
                u.rol_id AS rolId,
                u.unidad_id AS unidadId,
                r.nombre AS role,
                un.nombre AS unidadNombre
         FROM Usuario u
         JOIN Rol r ON u.rol_id = r.id
         JOIN Unidad_Organizacional un ON u.unidad_id = un.id
         WHERE u.id = ?`,
                [payload.id]
            );

            if (!rows.length) {
                return res.status(401).json({ error: "user_not_found" });
            }

            user = rows[0];
        } else {
            // 🚑 Fallback: usar usuario base (admin@gmail.com)
            const [rows] = await pool.execute(
                `SELECT u.id,
                u.email,
                u.rol_id AS rolId,
                u.unidad_id AS unidadId,
                r.nombre AS role,
                un.nombre AS unidadNombre
         FROM Usuario u
         JOIN Rol r ON u.rol_id = r.id
         JOIN Unidad_Organizacional un ON u.unidad_id = un.id
         WHERE u.email = 'admin@gmail.com'`
            );

            if (!rows.length) {
                return res.status(401).json({ error: "fallback_user_not_found" });
            }

            user = rows[0];
        }

        req.user = {
            id: user.id,
            email: user.email,
            rolId: user.rolId,
            role: user.role,
            unidadId: user.unidadId,
            unidadNombre: user.unidadNombre
        };

        req.actor = { id: user.id, email: user.email };

        return next();
    } catch (err) {
        console.error("Auth error:", err.message);
        return res.status(401).json({ error: "invalid_token" });
    }
}

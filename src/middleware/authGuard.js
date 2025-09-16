import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

export function authGuard(req, res, next) {
    // Re-read env each call to avoid stale value in hot reload/tests
    const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

    if (SKIP_AUTH) {
        req.user = {
            id: 0,
            email: "dev@local",
            role: "Administrador",
            rolId: 1,
            unidadId: 1   // 🚀 añadimos unidadId en modo dev
        };
        req.actor = { id: 0, email: "dev@local" };
        return next();
    }

    const auth = req.headers.authorization || "";
    const [scheme, token] = auth.split(" ");
    if (!/^Bearer$/i.test(scheme) || !token) {
        return res.status(401).json({ error: "missing_token" });
    }

    try {
        const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });

        // Normalize role + unidad fields for compatibility
        const rolId = payload.rolId ?? payload.rol_id ?? null;
        const role = payload.role ?? payload.roleName ?? null;
        const unidadId = payload.unidadId ?? payload.unidad_id ?? null; // 🚀 añadimos normalización

        req.user = { ...payload, rolId, role, unidadId }; // 🚀 incluye unidadId
        req.actor = { id: payload.id ?? null, email: payload.email ?? null };
        return next();
    } catch {
        return res.status(401).json({ error: "invalid_token" });
    }
}

import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

export function authGuard(req, res, next) {
    const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

    if (SKIP_AUTH) {
        req.user = {
            id: 0,
            email: "dev@local",
            role: "Administrador",
            rolId: 1,
            unidadId: 1,
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

        const rolId = payload.rolId ?? payload.rol_id ?? null;
        const role = payload.role ?? payload.roleName ?? null;
        const unidadId = payload.unidadId ?? payload.unidad_id ?? null;

        req.user = { ...payload, rolId, role, unidadId };
        req.actor = { id: payload.id ?? null, email: payload.email ?? null };
        return next();
    } catch {
        return res.status(401).json({ error: "invalid_token" });
    }
}

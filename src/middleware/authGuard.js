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
        console.log("⚙️  AUTH_DISABLED activo, se omite verificación de token.");
        return next();
    }

    const auth = req.headers.authorization || "";
    const [scheme, token] = auth.split(" ");
    if (!/^Bearer$/i.test(scheme) || !token) {
        console.warn("🚫 Solicitud sin token o con formato inválido:", auth);
        return res.status(401).json({ error: "missing_token" });
    }

    try {
        // 🧩 Verificar token
        const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
        console.log("✅ Token verificado correctamente:", payload);

        // Normalizar campos
        const rolId = payload.rolId ?? payload.rol_id ?? null;
        const role = payload.role ?? payload.roleName ?? null;
        const unidadId = payload.unidadId ?? payload.unidad_id ?? null;

        // Inyectar usuario en la request
        req.user = { ...payload, rolId, role, unidadId };
        req.actor = { id: payload.id ?? null, email: payload.email ?? null };

        return next();
    } catch (err) {
        console.error("❌ Error al verificar token:", err.message);
        return res.status(401).json({ error: "invalid_token" });
    }
}

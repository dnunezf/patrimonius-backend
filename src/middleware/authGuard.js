// src/middleware/authGuard.js
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

export function authGuard(req, res, next) {
    const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

    // SYSTEM user id (creado por seed al iniciar el server)
    const systemId = Number(process.env.SYSTEM_USER_ID);

    if (!Number.isFinite(systemId)) {
        console.warn("⚠️ SYSTEM_USER_ID no está seteado o no es un número válido:", process.env.SYSTEM_USER_ID);
    }

    // =================== DEV / AUTH_DISABLED ===================
    if (SKIP_AUTH) {
        const actorId = Number.isFinite(systemId) ? systemId : 1; // fallback por si acaso

        req.user = {
            id: actorId,
            email: "dev@local",
            role: "Administrador",
            rolId: 1,
            unidadId: 1,
            isMaster: true,
        };

        req.actor = { id: actorId, email: "dev@local", isMaster: true };

        console.log("⚙️ AUTH_DISABLED activo, se omite verificación de token. actorId =", actorId);
        return next();
    }

    // =================== JWT normal ===================
    const auth = req.headers.authorization || "";
    const [scheme, token] = auth.split(" ");

    if (!/^Bearer$/i.test(scheme) || !token) {
        console.warn("🚫 Solicitud sin token o con formato inválido:", auth);
        return res.status(401).json({ error: "missing_token" });
    }

    try {
        const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
        console.log("✅ Token verificado correctamente:", payload);

        // Normalizar campos
        const rolId = payload.rolId ?? payload.rol_id ?? null;
        const role = payload.role ?? payload.roleName ?? null;
        const unidadId = payload.unidadId ?? payload.unidad_id ?? null;

        // Resolver actorId:
        // - si es master hardcodeado (id 0) => usar SYSTEM_USER_ID
        // - si es usuario normal => usar payload.id
        const rawId = payload.id ?? null;
        const actorId =
            payload.isMaster === true
                ? (Number.isFinite(systemId) ? systemId : rawId)
                : rawId;

        req.user = { ...payload, rolId, role, unidadId };
        req.actor = { id: actorId, email: payload.email ?? null, isMaster: payload.isMaster ?? false };

        return next();
    } catch (err) {
        console.error("❌ Error al verificar token:", err.message);
        return res.status(401).json({ error: "invalid_token" });
    }
}

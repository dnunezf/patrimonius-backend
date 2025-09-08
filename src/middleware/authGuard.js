import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev_only_key";
const SKIP_AUTH = process.env.AUTH_DISABLED === "true";

export function authGuard(req, res, next) {
    if (SKIP_AUTH) {

        req.user = { id: 0, email: "dev@local", rolId: "ADMINISTRADO" };
        req.actor = { id: 0, email: "dev@local" };
        return next();
    }

    const header = req.headers["authorization"];
    if (!header) return res.status(401).json({ error: "missing_token" });

    const token = header.split(" ")[1];
    try {
        const payload = jwt.verify(token, SECRET);
        req.user = payload;
        req.actor = { id: payload.id, email: payload.email };
        next();
    } catch {
        return res.status(401).json({ error: "invalid_token" });
    }
}

import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const EXP_HOURS = Number(process.env.JWT_EXP_HOURS || 8);

/**
 * Firma un token JWT.
 * @param {object} payload - Datos del usuario o acción.
 * @param {number} ttlSeconds - (opcional) Tiempo de vida en segundos.
 */
function sign(payload, ttlSeconds = EXP_HOURS * 3600) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return jwt.sign({ ...payload, exp }, SECRET, { algorithm: "HS256" });
}

function verify(token) {
    return jwt.verify(token, SECRET, { algorithms: ["HS256"] });
}

function decode(token) {
    return jwt.decode(token);
}

export const jwtUtil = { sign, verify, decode };

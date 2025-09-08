
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const EXP_HOURS = Number(process.env.JWT_EXP_HOURS || 8);

function sign(payload) {
    // exp en segundos a partir de ahora
    const exp = Math.floor(Date.now() / 1000) + EXP_HOURS * 60 * 60;
    return jwt.sign({ ...payload, exp }, SECRET, { algorithm: "HS256" });
}

function verify(token) {
    return jwt.verify(token, SECRET, { algorithms: ["HS256"] });
}

function decode(token) {
    return jwt.decode(token);
}

export const jwtUtil = { sign, verify, decode };

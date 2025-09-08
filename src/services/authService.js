import jwt from "jsonwebtoken";
import { authRepo } from "../repositories/authRepo.js";
import { logSecurityEvent } from "../repositories/bitacoraRepo.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_only_key";
const SYSTEM_EMAIL = "system@internal";


let _systemUserId = null;

async function getSystemUserIdCached() {
    if (_systemUserId !== null) return _systemUserId;
    const u = await authRepo.findByEmail(SYSTEM_EMAIL);
    _systemUserId = u?.id ?? null;
    return _systemUserId;
}

export const authService = {

    async login(email, password, ip, userAgent) {
        const user = await authRepo.findByEmail(email);
        const systemUserId = await getSystemUserIdCached();


        if (!user) {
            if (!systemUserId) {

                throw new Error("SYSTEM user missing (crea system@internal primero)");
            }
            await logSecurityEvent({
                actorId: systemUserId,
                tipo: "LOGIN",
                result: "FAIL",
                ip,
                userAgent,
                detail: { email }
            });
            throw new Error("Usuario o contraseña incorrectos");
        }


        const ok = await authRepo.verifyPassword(password, user.password);
        if (!ok) {
            await logSecurityEvent({
                actorId: user.id,
                tipo: "FALLO_LOGIN",
                result: "FAIL",
                ip,
                userAgent,
                detail: {}
            });
            throw new Error("Usuario o contraseña incorrectos");
        }


        const token = jwt.sign(
            { id: user.id, email: user.email, rolId: user.rol_id },
            JWT_SECRET,
            { expiresIn: "8h" }
        );


        await logSecurityEvent({
            actorId: user.id,
            tipo: "LOGIN",
            result: "OK",
            ip,
            userAgent,
            detail: {}
        });

        return { token, user };
    }
};

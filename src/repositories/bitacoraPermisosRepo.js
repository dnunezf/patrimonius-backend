import { pool } from "../db/pool.js";

// Trim text to fit VARCHAR(150)
function short(text, max = 148) {
    if (!text) return "";
    return text.length <= max ? text : text.slice(0, max);
}

export const bitacoraPermisosRepo = {
    /**
     * Write one row per permission.
     * accion: 'EXCEPTION_APPLY' | 'EXCEPTION_REMOVE'
     */
    async log({ actorUserId, targetDocId, permiso, accion, motive, scope }) {
        const fecha = new Date();
        const resultado = short(`motivo:${motive}; alcance:${scope || "documento"}`);
        await pool.execute(
            "INSERT INTO Bitacora_Permisos (fecha,accion,resultado,usuario_id,documento_id,permiso) VALUES (?,?,?,?,?,?)",
            [fecha, accion, resultado, actorUserId, targetDocId, permiso]
        );
    }
};


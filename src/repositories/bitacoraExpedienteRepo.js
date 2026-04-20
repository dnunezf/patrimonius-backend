import { pool } from "../db/pool.js";

/**
 * Usuario para FK Bitacora_Expediente: actor o SYSTEM_USER_ID.
 */
export function resolveBitacoraUsuarioId(actorId) {
    const a = Number(actorId);
    if (Number.isFinite(a) && a > 0) {
        return a;
    }
    const sys = Number(process.env.SYSTEM_USER_ID);
    if (Number.isFinite(sys) && sys > 0) {
        return sys;
    }
    return null;
}

/**
 * Inserta en bitácora sin fallar la petición principal si la tabla falla.
 */
export async function insertBitacoraExpedienteSafe(row) {
    if (!row?.usuario_id) {
        console.warn("⚠️ Bitácora expediente omitida: sin usuario_id válido");
        return;
    }
    try {
        await bitacoraExpedienteRepo.insert(row);
    } catch (err) {
        console.warn("⚠️ Falló bitácora expediente:", err.message);
    }
}

/**
 * Registros en Bitacora_Expediente (ciclo de vida del expediente).
 */
export const bitacoraExpedienteRepo = {
    /**
     * @param {object} row
     * @param {number} row.expediente_id
     * @param {number} row.usuario_id
     * @param {string} row.evento - ENUM Bitacora_Expediente.evento
     * @param {'PERMITIDO'|'DENEGADO'} [row.resultado] - ENUM Bitacora_Expediente.resultado (por defecto PERMITIDO)
     * @param {string|null} [row.estado_anterior]
     * @param {string|null} [row.estado_nuevo]
     * @param {object|null} [row.detalle] - se serializa a JSON
     */
    async insert(row) {
        const detalle =
            row.detalle == null ? null : JSON.stringify(row.detalle);

        await pool.query(
            `INSERT INTO Bitacora_Expediente (
        expediente_id,
        usuario_id,
        evento,
        resultado,
        estado_anterior,
        estado_nuevo,
        detalle
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                row.expediente_id,
                row.usuario_id,
                row.evento,
                row.resultado ?? "PERMITIDO",
                row.estado_anterior ?? null,
                row.estado_nuevo ?? null,
                detalle,
            ],
        );
    },
};

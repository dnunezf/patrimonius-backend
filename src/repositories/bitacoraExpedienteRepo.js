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
     * Historial de bitácora del expediente (más reciente primero).
     * @param {number} expedienteId
     * @param {number} [limit=80]
     */
    async listByExpedienteId(expedienteId, limit = 80) {
        const eid = Number(expedienteId);
        const lim = Math.min(Math.max(Number(limit) || 80, 1), 200);
        if (!Number.isInteger(eid) || eid <= 0) {
            return [];
        }
        const [rows] = await pool.query(
            `SELECT
        be.id,
        be.fecha,
        be.expediente_id,
        be.usuario_id,
        be.evento,
        be.resultado,
        be.estado_anterior,
        be.estado_nuevo,
        be.detalle,
        u.email AS usuario_email,
        CONCAT_WS(' ', u.nombre, u.apellido1, NULLIF(TRIM(u.apellido2), '')) AS usuario_nombre
      FROM Bitacora_Expediente be
      INNER JOIN Usuario u ON u.id = be.usuario_id
      WHERE be.expediente_id = ?
      ORDER BY be.fecha DESC, be.id DESC
      LIMIT ?`,
            [eid, lim]
        );
        return rows || [];
    },
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

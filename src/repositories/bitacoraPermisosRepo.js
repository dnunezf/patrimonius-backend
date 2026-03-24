//src/repositories/bitacoraPermisosRepo.js
import { pool } from "../db/pool.js";

// Recorta a límite de columna (resultado puede ser VARCHAR(500) en migraciones recientes)
function short(text, max = 148) {
    if (!text) return "";
    return text.length <= max ? text : text.slice(0, max);
}

const MAX_RESULTADO = 498;

const TIPO_EXCEPCION = "EXCEPCION_ACCESO";

/**
 * Texto fijo para columna resultado (HU-005). Se calcula aquí para que siempre coincida
 * con accion/estado/permiso aunque un despliegue viejo no pasara `resultado`.
 */
function buildResultadoExcepcionAcceso({
    accion,
    estado_flujo,
    permiso,
    target_usuario_id,
    documento_id,
}) {
    if (target_usuario_id == null || documento_id == null) return null;
    const uid = Number(target_usuario_id);
    const did = Number(documento_id);
    const p = String(permiso || "").trim();

    if (accion === "EXCEPTION_APPLY") {
        if (estado_flujo === "APROBADA") {
            if (!p || p === "REVOCADA") return null;
            const parts = p.split(",").map((s) => s.trim()).filter(Boolean);
            const list = parts.length ? parts : ["VIEW"];
            const lista = list.join(", ");
            if (list.length === 1) {
                return `Permiso ${lista} asignado al usuario con ID ${uid} para el documento con ID ${did}.`;
            }
            return `Permisos ${lista} asignados al usuario con ID ${uid} para el documento con ID ${did}.`;
        }
        if (estado_flujo === "DENEGADA") {
            return `No se pudieron asignar los permisos al usuario con ID ${uid} para el documento con ID ${did}.`;
        }
    }
    if (accion === "EXCEPTION_REMOVE") {
        if (estado_flujo === "REVOCADA") {
            return `Permisos de excepción revocados al usuario con ID ${uid} para el documento con ID ${did}.`;
        }
        if (estado_flujo === "DENEGADA") {
            return `No se pudieron revocar los permisos de excepción del usuario con ID ${uid} para el documento con ID ${did}.`;
        }
    }
    return null;
}

/**
 * @typedef {object} LogPermisosPayload
 * @property {number} actorUserId - usuario que ejecuta la acción (legacy: Bitacora_Permisos.usuario_id)
 * @property {number} targetDocId
 * @property {string} permiso - VIEW / EDIT / SIGN / combinación separada por coma / REVOCADA en remove
 * @property {string} accion - p.ej. EXCEPTION_APPLY | EXCEPTION_REMOVE
 * @property {string} [motive] - motivo corto para resultado legacy
 * @property {string} [scope]
 * @property {string|null} [solicitud_id]
 * @property {number|null} [target_usuario_id] - beneficiario de la excepción (HU-005)
 * @property {number|null} [responsable_id] - quien crea/revoca (HU-005)
 * @property {'EXCEPCION_ACCESO'|'SOLICITUD_ACCESO_EXTERNO'|'DESCARGA_DOCUMENTO_APROBADO'|null} [tipo_flujo]
 * @property {'PENDIENTE'|'APROBADA'|'DENEGADA'|'REVOCADA'|'EXPIRADA'|'PERMITIDO'|'DENEGADO'|null} [estado_flujo]
 * @property {string|null} [justificacion]
 * @property {Date|null} [fecha_inicio_acceso]
 * @property {Date|null} [fecha_fin_acceso]
 * @property {string|null} [user_agent]
 * @property {object|null} [detalle]
 * @property {string|null} [resultado] - Texto legible para columna resultado; si no viene, texto genérico (evita formato motivo:…; alcance:…).
 */

export const bitacoraPermisosRepo = {
    /**
     * Write one row (HU-005: una fila por apply/remove con permisos en CSV).
     * accion: 'EXCEPTION_APPLY' | 'EXCEPTION_REMOVE'
     */
    async log({
        actorUserId,
        targetDocId,
        permiso,
        accion,
        motive,
        scope,
        solicitud_id = null,
        target_usuario_id = null,
        responsable_id = null,
        tipo_flujo = null,
        estado_flujo = null,
        justificacion = null,
        fecha_inicio_acceso = null,
        fecha_fin_acceso = null,
        user_agent = null,
        detalle = null,
        resultado: resultadoExplicito = null,
    }) {
        const fecha = new Date();
        let resultado =
            resultadoExplicito != null && String(resultadoExplicito).trim() !== ""
                ? short(String(resultadoExplicito), MAX_RESULTADO)
                : short("Registro de permiso en bitácora.", MAX_RESULTADO);

        if (tipo_flujo === TIPO_EXCEPCION) {
            const armado = buildResultadoExcepcionAcceso({
                accion,
                estado_flujo,
                permiso,
                target_usuario_id,
                documento_id: targetDocId,
            });
            if (armado) {
                resultado = short(armado, MAX_RESULTADO);
            }
        }
        const detalleJson =
            detalle != null ? (typeof detalle === "string" ? detalle : JSON.stringify(detalle)) : null;

        await pool.execute(
            `INSERT INTO Bitacora_Permisos (
                fecha, accion, resultado, usuario_id, documento_id, permiso,
                solicitud_id, target_usuario_id, responsable_id, tipo_flujo, estado_flujo,
                justificacion, fecha_inicio_acceso, fecha_fin_acceso, user_agent, detalle
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                fecha,
                accion,
                resultado,
                actorUserId,
                targetDocId,
                permiso,
                solicitud_id,
                target_usuario_id,
                responsable_id,
                tipo_flujo,
                estado_flujo,
                justificacion,
                fecha_inicio_acceso,
                fecha_fin_acceso,
                user_agent,
                detalleJson,
            ]
        );
    },

    /**
     * Último solicitud_id de una excepción otorgada (APROBADA) para correlacionar con REVOCADA.
     */
    async findLastSolicitudIdExcepcion({ targetUsuarioId, documentoId }) {
        const [rows] = await pool.query(
            `SELECT solicitud_id
             FROM Bitacora_Permisos
             WHERE target_usuario_id = ?
               AND documento_id = ?
               AND tipo_flujo = 'EXCEPCION_ACCESO'
               AND accion = 'EXCEPTION_APPLY'
               AND estado_flujo = 'APROBADA'
               AND solicitud_id IS NOT NULL
             ORDER BY fecha DESC
             LIMIT 1`,
            [Number(targetUsuarioId), Number(documentoId)]
        );
        const id = rows[0]?.solicitud_id;
        return id != null && String(id).trim() !== "" ? String(id) : null;
    },
};

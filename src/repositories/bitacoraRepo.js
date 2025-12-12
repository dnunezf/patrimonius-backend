import { pool } from "../db/pool.js";

/** Audit log writer. */
export async function logAdminAction({ actorId, docId = null, action, result, detail }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const systemId = Number(process.env.SYSTEM_USER_ID);
        const safeActorId =
            (actorId === 0 || actorId == null)
                ? (Number.isFinite(systemId) ? systemId : null)
                : actorId;

        const [r] = await conn.execute(
            `INSERT INTO Bitacora_Base (fecha,accion,resultado,usuario_id,documento_id)
       VALUES (NOW(),?,?,?,?)`,
            [action, result ?? null, safeActorId, docId ?? null]
        );

        const id = r.insertId;

        await conn.execute(
            `INSERT INTO Bitacora_Actividad_Usuario (id,actividad,recurso,parametros)
             VALUES (?,?,?,CAST(? AS JSON))`,
            [id, "OTRA", "ADMIN_USER", JSON.stringify(detail ?? {})]
        );

        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}


export async function logSecurityEvent({
                                           actorId,
                                           tipo,
                                           result,
                                           ip = null,
                                           userAgent = null,
                                           detail = {}
                                       }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [r] = await conn.execute(
            `INSERT INTO Bitacora_Base (fecha, accion, resultado, usuario_id, documento_id)
       VALUES (NOW(), ?, ?, ?, NULL)`,
            [tipo, result ?? null, (actorId ?? 0)]
        );

        const id = r.insertId;

        await conn.execute(
            `INSERT INTO Bitacora_Seguridad (id, tipo_evento, ip, user_agent, detalle)
       VALUES (?,?,?,?,CAST(? AS JSON))`,
            [id, tipo, ip, userAgent, JSON.stringify(detail || {})]
        );

        await conn.commit();
        return id;
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/* === Helpers internos para HU-007/008/016 === */
async function insertBase({ fecha = new Date(), accion, resultado = null, usuario_id = null, documento_id = null }) {
    const [res] = await pool.query(
        `INSERT INTO Bitacora_Base (fecha, accion, resultado, usuario_id, documento_id)
     VALUES (?, ?, ?, ?, ?)`,
        [fecha, accion, resultado, usuario_id, documento_id]
    );
    return res.insertId;
}

async function insertCiclo({ id, evento, detalle = null }) {
    await pool.query(
        `INSERT INTO Bitacora_Ciclo_Documental (id, evento, detalle)
     VALUES (?, ?, ?)`,
        [id, evento, detalle]
    );
}

async function insertActividad({ id, actividad, recurso, parametros = null }) {
    await pool.query(
        `INSERT INTO Bitacora_Actividad_Usuario (id, actividad, recurso, parametros)
     VALUES (?, ?, ?, ?)`,
        [id, actividad, recurso, parametros]
    );
}

/* === Export agrupado === */
export const bitacoraRepo = {
    insertBase,
    insertCiclo,
    insertActividad,
    logAdminAction,
    logSecurityEvent,
};

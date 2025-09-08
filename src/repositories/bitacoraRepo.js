import { pool } from "../db/pool.js";

/** Audit log writer. */
export async function logAdminAction({
  actorId,
  docId = null,
  action,
  result,
  detail,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.execute(
      `INSERT INTO Bitacora_Base (fecha,accion,resultado,usuario_id,documento_id)
       VALUES (NOW(),:accion,:resultado,:usuario_id,:documento_id)`,
      {
        accion: action,
        resultado: result ?? null,
        usuario_id: actorId ?? null,
        documento_id: docId ?? null,
      }
    );
    const id = r.insertId;
    await conn.execute(
      `INSERT INTO Bitacora_Actividad_Usuario (id,actividad,recurso,parametros)
       VALUES (:id,'OTRA','ADMIN_USER',CAST(:params AS JSON))`,
      { id, params: JSON.stringify(detail ?? {}) }
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
       VALUES (NOW(), :accion, :resultado, :usuario_id, NULLIF(NULLIF(:documento_id, 0), ''))`,
            {
                accion: tipo,
                resultado: result ?? null,
                usuario_id: actorId ?? null,
                documento_id: null,
            }
        );

        const id = r.insertId;

        await conn.execute(
            `INSERT INTO Bitacora_Seguridad (id, tipo_evento, ip, user_agent, detalle)
       VALUES (:id, :tipo, :ip, :ua, CAST(:detalle AS JSON))`,
            {
                id,
                tipo,
                ip,
                ua: userAgent,
                detalle: JSON.stringify(detail || {})
            }
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


import { pool } from "../db/pool.js";

/** Audit log writer. */
export async function logAdminAction({
  actorId,
  docId = 0,
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
        usuario_id: actorId,
        documento_id: docId,
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

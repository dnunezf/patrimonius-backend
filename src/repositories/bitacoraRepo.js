//repositories/bitacoraRepo.js
import { pool } from "../db/pool.js";
import {
  isExcludedUserActivityAccion,
  shouldRecordUserActivityBitacora,
} from "../utils/userActivityBitacoraPolicy.js";

/** Audit log writer. */
export async function logAdminAction({
  actorId,
  docId = null,
  action,
  result,
  detail,
}) {
  if (isExcludedUserActivityAccion(action)) {
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const systemId = Number(process.env.SYSTEM_USER_ID);
    const safeActorId =
      actorId === 0 || actorId == null
        ? Number.isFinite(systemId)
          ? systemId
          : null
        : actorId;

    await conn.execute(
      `INSERT INTO Bitacora_Base (fecha,accion,resultado,usuario_id,documento_id)
       VALUES (NOW(),?,?,?,?)`,
      [action, result ?? null, safeActorId, docId ?? null],
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
  detail = {},
}) {
  const buildAccion = () => {
    const safeTipo = String(tipo || "ACTIVIDAD_SEGURIDAD").toUpperCase();
    const method = String(detail?.method || "").toUpperCase();
    const path = String(detail?.path || detail?.route || "").trim();
    const op = String(detail?.operation || detail?.accion || "").trim();

    // Prefer explicit operation, then HTTP context, then fallback to type.
    if (op) return `${safeTipo}: ${op}`.slice(0, 150);
    if (method && path) return `${safeTipo}: ${method} ${path}`.slice(0, 150);
    if (path) return `${safeTipo}: ${path}`.slice(0, 150);
    return safeTipo.slice(0, 150);
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Use SYSTEM user when actorId is null/0 (master bypass, anonymous, etc.)
    const systemId = Number(process.env.SYSTEM_USER_ID || 1);
    const safeActorId =
      actorId === 0 || actorId == null
        ? Number.isFinite(systemId)
          ? systemId
          : 1
        : actorId;

    const [r] = await conn.execute(
      `INSERT INTO Bitacora_Base (fecha, accion, resultado, usuario_id, documento_id)
       VALUES (NOW(), ?, ?, ?, NULL)`,
      [buildAccion(), result ?? null, safeActorId],
    );

    const id = r.insertId;

    await conn.execute(
      `INSERT INTO Bitacora_Seguridad (id, tipo_evento, ip, user_agent, detalle)
       VALUES (?,?,?,?,CAST(? AS JSON))`,
      [id, tipo, ip, userAgent, JSON.stringify(detail || {})],
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
async function insertBase({
  fecha = new Date(),
  accion,
  resultado = null,
  usuario_id = null,
  documento_id = null,
}) {
  const [res] = await pool.query(
    `INSERT INTO Bitacora_Base (fecha, accion, resultado, usuario_id, documento_id)
     VALUES (?, ?, ?, ?, ?)`,
    [fecha, accion, resultado, usuario_id, documento_id],
  );
  return res.insertId;
}

async function insertCiclo({ id, evento, detalle = null }) {
  await pool.query(
    `INSERT INTO Bitacora_Ciclo_Documental (id, evento, detalle)
     VALUES (?, ?, ?)`,
    [id, evento, detalle],
  );
}

/**
 * Inserta fila en Bitacora_Actividad_Usuario solo si aplica a la bitácora de actividad de usuario.
 * Si no aplica, elimina la fila huérfana en Bitacora_Base y devuelve false.
 */
async function insertActividad({
  id,
  actividad,
  recurso,
  parametros = null,
  accion,
}) {
  if (!shouldRecordUserActivityBitacora({ accion, recurso, actividad })) {
    await pool.query(`DELETE FROM Bitacora_Base WHERE id = ?`, [id]);
    return false;
  }
  await pool.query(
    `INSERT INTO Bitacora_Actividad_Usuario (id, actividad, recurso, parametros)
     VALUES (?, ?, ?, ?)`,
    [id, actividad, recurso, parametros],
  );
  return true;
}

/* === Export agrupado === */
export const bitacoraRepo = {
  insertBase,
  insertCiclo,
  insertActividad,
  logAdminAction,
  logSecurityEvent,
};

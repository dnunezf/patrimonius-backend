// src/repositories/bitacoraSecurity.repo.js

/**
 * HU-002 Requirement:
 * - Every denied access attempt must be registered in the system log (Bitacora_Seguridad).
 */
export class BitacoraSecurityRepo {
  /**
   * @param {import("mysql2/promise").Pool} pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * @param {{ actorId:number|null, documentId:number, action:string, reason:string, level:string }} e
   */
  async logDenied(e) {
    const payload = {
      documentId: e.documentId,
      action: e.action,
      reason: e.reason,
      level: e.level,
    };

    // Adjust columns if your schema differs.
    await this.pool.query(
      `
      INSERT INTO Bitacora_Seguridad (usuario_id, tipo_evento, detalle)
      VALUES (?, 'ACCESO_NO_AUTORIZADO', ?)
      `,
      [e.actorId ?? null, JSON.stringify(payload)],
    );
  }
}

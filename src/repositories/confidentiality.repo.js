// src/repositories/confidentiality.repo.js

/**
 * HU-002 Repository
 * - Persists and retrieves document confidentiality level and allow-lists.
 * - Stores actions as MySQL SET string: "VIEW,EDIT,SIGN"
 */
export class ConfidentialityRepo {
  /**
   * @param {import("mysql2/promise").Pool} pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * List documents for the admin UI selector.
   * @param {string} search
   */
  async listDocuments(search = "") {
    const q = `%${String(search || "").trim()}%`;

    const [rows] = await this.pool.query(
      `
      SELECT
        d.id,
        COALESCE(d.codigo_unico, d.codigo_oficial, CAST(d.id AS CHAR)) AS code,
        COALESCE(d.titulo, CONCAT('Documento ', d.id)) AS title,
        d.confid_level AS level,
        u.nombre AS unit,
        d.unidad_organizacional_id AS unitId
      FROM Documento d
      LEFT JOIN Unidad_Organizacional u ON u.id = d.unidad_organizacional_id
      WHERE (? = '%%')
         OR (d.titulo LIKE ?)
         OR (d.codigo_unico LIKE ?)
         OR (d.codigo_oficial LIKE ?)
         OR (CAST(d.id AS CHAR) LIKE ?)
      ORDER BY d.id DESC
      LIMIT 500
      `,
      [q, q, q, q, q],
    );

    return rows;
  }

  /**
   * Get current config (level + allow-lists).
   * @param {number} documentId
   */
  async getConfig(documentId) {
    const docId = Number(documentId);

    const [[doc]] = await this.pool.query(
      `SELECT id, confid_level AS level FROM Documento WHERE id = ?`,
      [docId],
    );

    if (!doc) {
      const err = new Error("document_not_found");
      err.status = 404;
      throw err;
    }

    const [uRows] = await this.pool.query(
      `SELECT usuario_id AS userId, actions FROM Documento_Allowed_User WHERE documento_id = ?`,
      [docId],
    );

    const [rRows] = await this.pool.query(
      `SELECT rol_id AS roleId, actions FROM Documento_Allowed_Rol WHERE documento_id = ?`,
      [docId],
    );

    return {
      documentId: docId,
      level: doc.level || "PUBLIC",
      users: (uRows || []).map((r) => ({
        userId: Number(r.userId),
        actions: this._splitSet(r.actions),
      })),
      roles: (rRows || []).map((r) => ({
        roleId: Number(r.roleId),
        actions: this._splitSet(r.actions),
      })),
    };
  }

  /**
   * Replace config atomically.
   * @param {number} documentId
   * @param {{level: string, users: Array<{userId:number, actions:string[]}>, roles: Array<{roleId:number, actions:string[]}>}} dto
   */
  async setConfig(documentId, dto) {
    const docId = Number(documentId);

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(`UPDATE Documento SET confid_level = ? WHERE id = ?`, [
        dto.level,
        docId,
      ]);

      // Replace allow-lists
      await conn.query(
        `DELETE FROM Documento_Allowed_User WHERE documento_id = ?`,
        [docId],
      );
      await conn.query(
        `DELETE FROM Documento_Allowed_Rol WHERE documento_id = ?`,
        [docId],
      );

      if (dto.users?.length) {
        const values = dto.users.map((u) => [
          docId,
          Number(u.userId),
          this._toSetString(u.actions),
        ]);
        await conn.query(
          `INSERT INTO Documento_Allowed_User (documento_id, usuario_id, actions)
           VALUES ${values.map(() => "(?,?,?)").join(",")}`,
          values.flat(),
        );
      }

      if (dto.roles?.length) {
        const values = dto.roles.map((r) => [
          docId,
          Number(r.roleId),
          this._toSetString(r.actions),
        ]);
        await conn.query(
          `INSERT INTO Documento_Allowed_Rol (documento_id, rol_id, actions)
           VALUES ${values.map(() => "(?,?,?)").join(",")}`,
          values.flat(),
        );
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    return this.getConfig(docId);
  }

  /**
   * MySQL SET can come as string "VIEW,EDIT" or null/empty.
   * @param {any} v
   */
  _splitSet(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  /**
   * FIX: Always join on an ARRAY.
   * - Accepts array or string; normalizes to "VIEW,EDIT,SIGN"
   * @param {any} actions
   */
  _toSetString(actions) {
    const arr = Array.isArray(actions)
      ? actions
      : typeof actions === "string"
        ? actions.split(",").map((s) => s.trim())
        : [];

    const allowed = new Set(["VIEW", "EDIT", "SIGN"]);
    const normalized = Array.from(new Set(arr.filter((x) => allowed.has(x))));
    return normalized.join(",");
  }

  async isUserAllowed(documentId, userId, action) {
    const [rows] = await this.pool.query(
      `
      SELECT 1 AS ok
      FROM Documento_Allowed_User
      WHERE documento_id = ?
        AND usuario_id = ?
        AND FIND_IN_SET(?, actions) > 0
      LIMIT 1
      `,
      [Number(documentId), Number(userId), String(action)],
    );
    return rows?.length > 0;
  }

  async isAnyRoleAllowed(documentId, rolIds, action) {
    const ids = (rolIds || [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return false;

    const [rows] = await this.pool.query(
      `
      SELECT 1 AS ok
      FROM Documento_Allowed_Rol
      WHERE documento_id = ?
        AND rol_id IN (?)
        AND FIND_IN_SET(?, actions) > 0
      LIMIT 1
      `,
      [Number(documentId), ids, String(action)],
    );
    return rows?.length > 0;
  }
}

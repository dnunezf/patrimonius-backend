import { normalizeActions } from "../validators/confidentiality.schema.js";

function setToArray(mysqlSetValue) {
  if (!mysqlSetValue) return [];
  if (Array.isArray(mysqlSetValue)) return normalizeActions(mysqlSetValue);
  // mysql2 returns SET as string: "VIEW,EDIT"
  return normalizeActions(
    String(mysqlSetValue)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function arrayToSetString(actions) {
  const norm = normalizeActions(actions);
  return norm.join(","); // stored into SET column
}

export class ConfidentialityRepo {
  constructor(pool) {
    this.pool = pool;
  }

  async listDocuments(search = "") {
    const q = `%${search}%`;
    const [rows] = await this.pool.query(
      `
      SELECT
        d.id AS id,
        COALESCE(d.codigo_unico, d.codigo_oficial, CAST(d.id AS CHAR)) AS code,
        COALESCE(d.titulo, CONCAT('Documento ', d.id)) AS title,
        d.estado AS status,
        d.confid_level AS level,
        u.nombre AS unit,
        d.unidad_id AS unitId
      FROM Documento d
      LEFT JOIN Unidad_Organizacional u ON u.id = d.unidad_id
      WHERE (? = '' OR d.titulo LIKE ? OR d.codigo_unico LIKE ? OR d.codigo_oficial LIKE ? OR CAST(d.id AS CHAR) LIKE ?)
      ORDER BY d.id DESC
      LIMIT 500
      `,
      [search, q, q, q, q]
    );
    return rows;
  }

  async getConfig(documentId) {
    const [[doc]] = await this.pool.query(
      `SELECT id, titulo AS title, confid_level AS level FROM Documento WHERE id = ?`,
      [documentId]
    );
    if (!doc) return null;

    const [users] = await this.pool.query(
      `SELECT usuario_id AS userId, actions FROM Documento_Allowed_User WHERE documento_id = ?`,
      [documentId]
    );
    const [roles] = await this.pool.query(
      `SELECT rol_id AS roleId, actions FROM Documento_Allowed_Rol WHERE documento_id = ?`,
      [documentId]
    );

    return {
      documentId: doc.id,
      title: doc.title ?? null,
      level: doc.level ?? "PUBLIC",
      users: (users || []).map((r) => ({
        userId: Number(r.userId),
        actions: setToArray(r.actions),
      })),
      roles: (roles || []).map((r) => ({
        roleId: Number(r.roleId),
        actions: setToArray(r.actions),
      })),
    };
  }

  async setConfigTx(conn, documentId, level, users, roles) {
    await conn.query(`UPDATE Documento SET confid_level = ? WHERE id = ?`, [
      level,
      documentId,
    ]);

    // Replace allow-lists atomically
    await conn.query(
      `DELETE FROM Documento_Allowed_User WHERE documento_id = ?`,
      [documentId]
    );
    await conn.query(
      `DELETE FROM Documento_Allowed_Rol WHERE documento_id = ?`,
      [documentId]
    );

    if (users.length) {
      const values = users.map((u) => [
        documentId,
        u.userId,
        arrayToSetString(u.actions),
      ]);
      await conn.query(
        `INSERT INTO Documento_Allowed_User (documento_id, usuario_id, actions) VALUES ?`,
        [values]
      );
    }
    if (roles.length) {
      const values = roles.map((r) => [
        documentId,
        r.roleId,
        arrayToSetString(r.actions),
      ]);
      await conn.query(
        `INSERT INTO Documento_Allowed_Rol (documento_id, rol_id, actions) VALUES ?`,
        [values]
      );
    }
  }

  async isUserAllowed(documentId, userId, action) {
    const [[row]] = await this.pool.query(
      `
      SELECT 1 AS ok
      FROM Documento_Allowed_User
      WHERE documento_id = ? AND usuario_id = ? AND FIND_IN_SET(?, actions) > 0
      LIMIT 1
      `,
      [documentId, userId, action]
    );
    return !!row;
  }

  async isAnyRoleAllowed(documentId, roleIds, action) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) return false;

    const [rows] = await this.pool.query(
      `
      SELECT 1 AS ok
      FROM Documento_Allowed_Rol
      WHERE documento_id = ?
        AND rol_id IN (?)
        AND FIND_IN_SET(?, actions) > 0
      LIMIT 1
      `,
      [documentId, roleIds, action]
    );
    return rows.length > 0;
  }

  async getDocLevel(documentId) {
    const [[row]] = await this.pool.query(
      `SELECT confid_level AS level FROM Documento WHERE id = ?`,
      [documentId]
    );
    return row?.level ?? null;
  }
}

// src/repositories/confidentiality.repo.js

/**
 * ConfidentialityRepo
 * - Reads/writes document confidentiality and explicit allow-lists.
 * - Normalizes MySQL SET values (string "VIEW,EDIT") to arrays ["VIEW","EDIT"].
 */

const ACTIONS = new Set(["VIEW", "EDIT", "SIGN"]);
const LEVELS = new Set(["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"]);

function normalizeActions(input, fallback = ["VIEW"]) {
  // Accept: array | string | null
  if (Array.isArray(input)) {
    const out = [...new Set(input.filter((x) => ACTIONS.has(x)))];
    return out.length ? out : fallback;
  }
  if (typeof input === "string") {
    const parts = input
      .split(",")
      .map((s) => s.trim())
      .filter((x) => ACTIONS.has(x));
    const out = [...new Set(parts)];
    return out.length ? out : fallback;
  }
  return fallback;
}

function actionsToDbValue(actions) {
  // Always store as "VIEW,EDIT,SIGN"
  const arr = normalizeActions(actions);
  return arr.join(",");
}

function normalizeLevel(level) {
  return LEVELS.has(level) ? level : "PUBLIC";
}

export class ConfidentialityRepo {
  constructor(pool) {
    this.pool = pool;
  }

  async listDocuments(search = "") {
    const q = `%${String(search || "").trim()}%`;

    // Adjust fields to your Documento schema/views (these are safe defaults).
    const [rows] = await this.pool.execute(
      `
      SELECT
        d.id AS id,
        COALESCE(d.codigo_unico, d.codigo_oficial, CONCAT(d.id)) AS code,
        COALESCE(d.titulo, CONCAT('Documento ', d.id)) AS title,
        d.confid_level AS level,
        u.nombre AS unit,
        u.id AS unitId
      FROM Documento d
      LEFT JOIN Unidad_Organizacional u ON u.id = d.unidad_id
      WHERE (? = '%%')
         OR d.titulo LIKE ?
         OR d.codigo_unico LIKE ?
         OR d.codigo_oficial LIKE ?
         OR CAST(d.id AS CHAR) LIKE ?
      ORDER BY d.id DESC
      LIMIT 500
      `,
      [q, q, q, q, q]
    );

    return rows.map((r) => ({
      id: Number(r.id),
      code: r.code ?? String(r.id),
      title: r.title ?? `Documento ${r.id}`,
      level: normalizeLevel(r.level),
      unit: r.unit ?? null,
      unitId: r.unitId != null ? Number(r.unitId) : null,
    }));
  }

  async getConfig(documentId) {
    const docId = Number(documentId);

    const [[doc]] = await this.pool.execute(
      `SELECT id, confid_level, titulo FROM Documento WHERE id = ?`,
      [docId]
    );
    if (!doc) return null;

    const [users] = await this.pool.execute(
      `
      SELECT documento_id, usuario_id AS userId, actions, created_at
      FROM Documento_Allowed_User
      WHERE documento_id = ?
      ORDER BY usuario_id ASC
      `,
      [docId]
    );

    const [roles] = await this.pool.execute(
      `
      SELECT documento_id, rol_id AS roleId, actions, created_at
      FROM Documento_Allowed_Rol
      WHERE documento_id = ?
      ORDER BY rol_id ASC
      `,
      [docId]
    );

    return {
      documentId: docId,
      title: doc.titulo ?? null,
      level: normalizeLevel(doc.confid_level),
      users: (users || []).map((u) => ({
        userId: Number(u.userId),
        actions: normalizeActions(u.actions),
        authorizedAt: u.created_at ?? null,
      })),
      roles: (roles || []).map((r) => ({
        roleId: Number(r.roleId),
        actions: normalizeActions(r.actions),
        authorizedAt: r.created_at ?? null,
      })),
    };
  }

  async setConfig({ documentId, level, users, roles }) {
    const docId = Number(documentId);
    const lv = normalizeLevel(level);

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(`UPDATE Documento SET confid_level = ? WHERE id = ?`, [
        lv,
        docId,
      ]);

      // Replace allow-lists atomically
      await conn.execute(
        `DELETE FROM Documento_Allowed_User WHERE documento_id = ?`,
        [docId]
      );
      await conn.execute(
        `DELETE FROM Documento_Allowed_Rol WHERE documento_id = ?`,
        [docId]
      );

      // Insert users
      for (const u of users || []) {
        const userId = Number(u.userId);
        if (!Number.isFinite(userId) || userId <= 0) continue;

        await conn.execute(
          `
          INSERT INTO Documento_Allowed_User (documento_id, usuario_id, actions)
          VALUES (?,?,?)
          `,
          [docId, userId, actionsToDbValue(u.actions)]
        );
      }

      // Insert roles
      for (const r of roles || []) {
        const roleId = Number(r.roleId);
        if (!Number.isFinite(roleId) || roleId <= 0) continue;

        await conn.execute(
          `
          INSERT INTO Documento_Allowed_Rol (documento_id, rol_id, actions)
          VALUES (?,?,?)
          `,
          [docId, roleId, actionsToDbValue(r.actions)]
        );
      }

      await conn.commit();
      return true;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

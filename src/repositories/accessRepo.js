// src/repositories/accessRepo.js
import { pool } from "../db/pool.js";

/** SQL-only repository for HU-002 confidential access. */
export const accessRepo = {
  async getConfig(documentId) {
    const [docRows] = await pool.query(
      `SELECT id, titulo, confid_level FROM Documento WHERE id=:id LIMIT 1`,
      { id: documentId }
    );
    if (!docRows[0]) return null;

    const [uRows] = await pool.query(
      `SELECT usuario_id AS userId, actions
       FROM Documento_Allowed_User
       WHERE documento_id=:id`,
      { id: documentId }
    );

    const [rRows] = await pool.query(
      `SELECT rol_id AS roleId, actions
       FROM Documento_Allowed_Rol
       WHERE documento_id=:id`,
      { id: documentId }
    );

    return {
      documentId,
      title: docRows[0].titulo,
      level: docRows[0].confid_level,
      users: uRows.map((r) => ({
        userId: Number(r.userId),
        actions: String(r.actions || "")
          .split(",")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean),
      })),
      roles: rRows.map((r) => ({
        roleId: Number(r.roleId),
        actions: String(r.actions || "")
          .split(",")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean),
      })),
    };
  },

  async setLevel(documentId, level) {
    await pool.execute(
      `UPDATE Documento SET confid_level=:level WHERE id=:id`,
      { id: documentId, level }
    );
  },

  async upsertUsers(documentId, entries = []) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE FROM Documento_Allowed_User WHERE documento_id=?`,
        [documentId]
      );
      if (entries.length) {
        const values = entries.map((e) => [
          documentId,
          Number(e.userId),
          String(e.actions || []).join(","),
        ]);
        await conn.query(
          `INSERT INTO Documento_Allowed_User (documento_id, usuario_id, actions) VALUES ?`,
          [values]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  async upsertRoles(documentId, entries = []) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE FROM Documento_Allowed_Rol WHERE documento_id=?`,
        [documentId]
      );
      if (entries.length) {
        const values = entries.map((e) => [
          documentId,
          Number(e.roleId),
          String(e.actions || []).join(","),
        ]);
        await conn.query(
          `INSERT INTO Documento_Allowed_Rol (documento_id, rol_id, actions) VALUES ?`,
          [values]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  /**
   * Multi-role explicit allow:
   * - user allow-list is checked first
   * - then role allow-list for ANY role in roleIds[]
   */
  async isUserExplicitlyAllowed({ documentId, userId, roleIds = [], action }) {
    const d = Number(documentId);
    const u = Number(userId);
    const a = String(action || "").toUpperCase();

    const [uRows] = await pool.query(
      `SELECT 1
       FROM Documento_Allowed_User
       WHERE documento_id=:d AND usuario_id=:u AND FIND_IN_SET(:a, actions)
       LIMIT 1`,
      { d, u, a }
    );
    if (uRows.length) return true;

    const safeRoleIds =
      Array.isArray(roleIds) && roleIds.length
        ? roleIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : [];

    if (!safeRoleIds.length) return false;

    const [rRows] = await pool.query(
      `SELECT 1
       FROM Documento_Allowed_Rol
       WHERE documento_id=:d
         AND rol_id IN (?)
         AND FIND_IN_SET(:a, actions)
       LIMIT 1`,
      [d, safeRoleIds, a]
    );
    return rRows.length > 0;
  },

  async getLevel(documentId) {
    const [rows] = await pool.query(
      `SELECT confid_level FROM Documento WHERE id=:id LIMIT 1`,
      { id: documentId }
    );
    return rows[0]?.confid_level ?? null;
  },

  async documentExists(documentId) {
    const [rows] = await pool.query(
      `SELECT 1 FROM Documento WHERE id=:id LIMIT 1`,
      { id: documentId }
    );
    return rows.length > 0;
  },

  async usersExist(userIds = []) {
    const ids = Array.from(new Set(userIds.map(Number))).filter(
      (n) => Number.isInteger(n) && n > 0
    );
    if (!ids.length) return true;
    const [rows] = await pool.query(`SELECT id FROM Usuario WHERE id IN (?)`, [
      ids,
    ]);
    return rows.length === ids.length;
  },

  async rolesExist(roleIds = []) {
    const ids = Array.from(new Set(roleIds.map(Number))).filter(
      (n) => Number.isInteger(n) && n > 0
    );
    if (!ids.length) return true;
    const [rows] = await pool.query(`SELECT id FROM Rol WHERE id IN (?)`, [
      ids,
    ]);
    return rows.length === ids.length;
  },
};

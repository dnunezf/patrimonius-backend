//src/repositories/accessRepo.js
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
      `SELECT usuario_id AS userId, actions FROM Documento_Allowed_User WHERE documento_id=:id`,
      { id: documentId }
    );
    const [rRows] = await pool.query(
      `SELECT rol_id AS roleId, actions FROM Documento_Allowed_Rol WHERE documento_id=:id`,
      { id: documentId }
    );

    return {
      documentId,
      title: docRows[0].titulo,
      level: docRows[0].confid_level,
      users: uRows.map((r) => ({
        userId: r.userId,
        actions: String(r.actions).split(","),
      })),
      roles: rRows.map((r) => ({
        roleId: r.roleId,
        actions: String(r.actions).split(","),
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
          e.userId,
          e.actions.join(","),
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
          e.roleId,
          e.actions.join(","),
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

  async isUserExplicitlyAllowed({ documentId, userId, roleId, action }) {
    const [u] = await pool.query(
      `SELECT 1 FROM Documento_Allowed_User
       WHERE documento_id=:d AND usuario_id=:u AND FIND_IN_SET(:a, actions)`,
      { d: documentId, u: userId, a: action }
    );
    if (u.length) return true;

    const [r] = await pool.query(
      `SELECT 1 FROM Documento_Allowed_Rol
       WHERE documento_id=:d AND rol_id=:r AND FIND_IN_SET(:a, actions)`,
      { d: documentId, r: roleId, a: action }
    );
    return r.length > 0;
  },

  async getLevel(documentId) {
    const [rows] = await pool.query(
      `SELECT confid_level FROM Documento WHERE id=:id LIMIT 1`,
      { id: documentId }
    );
    return rows[0]?.confid_level ?? null;
  },
};

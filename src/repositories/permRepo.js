// src/repositories/permRepo.js
import { pool } from "../db/pool.js";

/** Stores editor-level capabilities independently from document overrides. */
export const permRepo = {
  async setForUser(userId, perms = []) {
    const unique = Array.from(
      new Set(
        (Array.isArray(perms) ? perms : [])
          .map((p) => String(p).toUpperCase())
          .filter((p) => p === "EDIT" || p === "SIGN")
      )
    );
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`DELETE FROM Editor_Permission WHERE user_id=?`, [
        userId,
      ]);
      if (unique.length) {
        const values = unique.map((p) => [userId, p]);
        await conn.query(
          `INSERT INTO Editor_Permission (user_id, perm) VALUES ?`,
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

  async getForUser(userId) {
    const [rows] = await pool.query(
      `SELECT perm FROM Editor_Permission WHERE user_id=:userId`,
      { userId }
    );
    return rows.map((r) => r.perm);
  },
};

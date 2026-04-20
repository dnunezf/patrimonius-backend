import { pool } from "../db/pool.js";

export const refreshTokenRepo = {
    async create({
                     usuario_id,
                     token_hash,
                     expires_at,
                     user_agent = null,
                     ip = null,
                 }) {
        const [res] = await pool.query(
            `
      INSERT INTO Refresh_Token (
        usuario_id,
        token_hash,
        expires_at,
        user_agent,
        ip
      )
      VALUES (?, ?, ?, ?, ?)
      `,
            [usuario_id, token_hash, expires_at, user_agent, ip]
        );

        return res.insertId;
    },

    async findValidByHash(token_hash) {
        const [rows] = await pool.query(
            `
      SELECT *
      FROM Refresh_Token
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
      `,
            [token_hash]
        );

        return rows[0] ?? null;
    },

    async revokeByHash(token_hash) {
        await pool.query(
            `
      UPDATE Refresh_Token
      SET revoked_at = NOW()
      WHERE token_hash = ?
        AND revoked_at IS NULL
      `,
            [token_hash]
        );
    },

    async revokeByUser(usuario_id) {
        await pool.query(
            `
      UPDATE Refresh_Token
      SET revoked_at = NOW()
      WHERE usuario_id = ?
        AND revoked_at IS NULL
      `,
            [usuario_id]
        );
    },
};
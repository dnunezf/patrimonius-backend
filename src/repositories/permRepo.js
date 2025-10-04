import { pool } from "../db/pool.js";

/** Editor permission repository. */
export const permRepo = {
    async setForUser(userId, perms = []) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute(`DELETE FROM Permiso_Usuario WHERE usuario_id=?`, [
                userId,
            ]);
            if (perms.length) {
                const values = perms.map((p) => [userId, p]);
                await conn.query(
                    `INSERT INTO Permiso_Usuario (usuario_id, permiso) VALUES ?`,
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
            `SELECT permiso FROM Permiso_Usuario WHERE usuario_id=:userId`,
            { userId }
        );
        return rows.map((r) => r.permiso);
    },
};
//hola
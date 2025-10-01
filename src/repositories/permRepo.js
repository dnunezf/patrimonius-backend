import { pool } from "../db/pool.js";

/** Editor/document permissions repository. */
export const permRepo = {
    // Asignar permisos a un usuario sobre un documento
    async setForUserOnDoc(usuario_id, documento_id, perms = [], motive = null) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // borrar permisos previos
            await conn.query(
                `DELETE FROM Permiso_Usuario WHERE usuario_id = ? AND documento_id = ?`,
                [usuario_id, documento_id]
            );

            // insertar nuevos
            if (perms.length) {
                for (const p of perms) {
                    await conn.query(
                        `INSERT INTO Permiso_Usuario (usuario_id, documento_id, permiso, motive)
             VALUES (?, ?, ?, ?)`,
                        [usuario_id, documento_id, p, motive]
                    );
                }
            }

            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    },

    // Obtener permisos de un usuario sobre un documento
    async getForUserOnDoc(usuario_id, documento_id) {
        const [rows] = await pool.query(
            `SELECT permiso FROM Permiso_Usuario WHERE usuario_id = ? AND documento_id = ?`,
            [usuario_id, documento_id]
        );
        return rows.map((r) => r.permiso);
    },

    // (Compatibilidad con tu service viejo) - permisos globales ficticios
    async getForUser(usuario_id) {
        // ojo: esto devuelve permisos distintos si no se pasa documento_id
        const [rows] = await pool.query(
            `SELECT DISTINCT permiso FROM Permiso_Usuario WHERE usuario_id = ?`,
            [usuario_id]
        );
        return rows.map((r) => r.permiso);
    }
};

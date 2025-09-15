import { pool } from "../db/pool.js";

export const permissionExceptionRepo = {
    // Replace all perms for (userId, documentId) with provided list
    async upsert(userId, documentId, perms, motive/* 'VIEW'|'EDIT'|'SIGN'[] */) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            await conn.execute(
                "DELETE FROM Permiso_Usuario WHERE usuario_id=? AND documento_id=?",
                [userId, documentId]
            );

            if (perms.length) {
                const values = perms.map(p => [userId, p, documentId,motive ?? null]);
                // Bulk insert: VALUES ?
                await conn.query(
                    "INSERT INTO Permiso_Usuario (usuario_id, permiso, documento_id,motive) VALUES ?",
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

    // List active exceptions
    async list() {
        const [rows] = await pool.query(
            `SELECT pu.usuario_id AS userId,
                    u.nombre, u.apellido1, u.apellido2, u.email,
                    pu.documento_id AS documentId,
                    d.titulo, d.numero_serie,
                    GROUP_CONCAT(pu.permiso ORDER BY pu.permiso) AS permissions,
                    MAX(pu.motive) AS motive
             FROM Permiso_Usuario pu
                      JOIN Usuario u ON u.id = pu.usuario_id
                      LEFT JOIN Documento d ON d.id = pu.documento_id
             WHERE pu.documento_id IS NOT NULL
             GROUP BY pu.usuario_id, pu.documento_id
             ORDER BY MAX(d.fecha) DESC, u.id DESC`
        );
        return rows;
    },

    // Remove exceptions for a pair
    async remove(userId, documentId) {
        await pool.execute(
            "DELETE FROM Permiso_Usuario WHERE usuario_id=? AND documento_id=?",
            [userId, documentId]
        );
    }
};
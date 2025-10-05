import { pool } from "../db/pool.js";

export const editSessionRepo = {
    // Registrar o renovar sesión de edición
    async upsert(documento_id, usuario_id) {
        const sql = `
      INSERT INTO Documento_Edit_Session (documento_id, usuario_id, last_seen)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE last_seen = NOW()
    `;
        await pool.query(sql, [documento_id, usuario_id]);
    },

    // Listar usuarios que están activos en la edición de un documento
    async listActive(documento_id, timeoutSeconds = 60) {
        const sql = `
      SELECT u.id, u.nombre, u.apellido1, u.apellido2, u.email, s.last_seen
      FROM Documento_Edit_Session s
      JOIN Usuario u ON u.id = s.usuario_id
      WHERE s.documento_id = ?
        AND TIMESTAMPDIFF(SECOND, s.last_seen, NOW()) <= ?
      ORDER BY s.last_seen DESC
    `;
        const [rows] = await pool.query(sql, [documento_id, timeoutSeconds]);
        return rows;
    },

    // Eliminar sesión explícitamente (cuando usuario cierra documento)
    async remove(documento_id, usuario_id) {
        const sql = `DELETE FROM Documento_Edit_Session WHERE documento_id = ? AND usuario_id = ?`;
        await pool.query(sql, [documento_id, usuario_id]);
    },

    // Limpieza de sesiones vencidas (cron opcional)
    async clearExpired(timeoutSeconds = 300) {
        const sql = `
      DELETE FROM Documento_Edit_Session
      WHERE TIMESTAMPDIFF(SECOND, last_seen, NOW()) > ?
    `;
        await pool.query(sql, [timeoutSeconds]);
    }
};

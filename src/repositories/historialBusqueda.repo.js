import { pool } from "../db/pool.js";

export const historialBusquedaRepo = {
    async create({ usuario_id, texto_busqueda, filtros }) {
        const sql = `
      INSERT INTO Historial_Busqueda (
        usuario_id,
        texto_busqueda,
        filtros
      )
      VALUES (?, ?, ?)
    `;

        const filtrosJson =
            filtros == null ? null : JSON.stringify(filtros);

        const [result] = await pool.query(sql, [
            Number(usuario_id),
            texto_busqueda?.trim() || null,
            filtrosJson,
        ]);

        return {
            id: result.insertId,
            usuario_id: Number(usuario_id),
            texto_busqueda: texto_busqueda?.trim() || null,
            filtros: filtros ?? null,
        };
    },

    async listByUsuario({ usuario_id, limit = 10 }) {
        const sql = `
      SELECT
        id,
        usuario_id,
        texto_busqueda,
        filtros,
        fecha_consulta
      FROM Historial_Busqueda
      WHERE usuario_id = ?
      ORDER BY fecha_consulta DESC, id DESC
      LIMIT ?
    `;

        const [rows] = await pool.query(sql, [
            Number(usuario_id),
            Math.max(1, Math.min(50, Number(limit) || 10)),
        ]);

        return (rows || []).map((row) => ({
            ...row,
            filtros:
                row.filtros && typeof row.filtros === "string"
                    ? safeJsonParse(row.filtros)
                    : row.filtros ?? null,
        }));
    },

    async clearByUsuario({ usuario_id }) {
        const [result] = await pool.query(
            `DELETE FROM Historial_Busqueda WHERE usuario_id = ?`,
            [Number(usuario_id)]
        );

        return {
            deletedCount: Number(result.affectedRows || 0),
        };
    },

    async deleteOne({ id, usuario_id }) {
        const [result] = await pool.query(
            `DELETE FROM Historial_Busqueda WHERE id = ? AND usuario_id = ?`,
            [Number(id), Number(usuario_id)]
        );

        return {
            deletedCount: Number(result.affectedRows || 0),
        };
    },
};

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}
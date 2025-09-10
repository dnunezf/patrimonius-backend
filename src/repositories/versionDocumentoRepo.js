import { pool } from "../db/pool.js";

/** VersionDocumento repository. SQL-only. */
export const versionDocumentoRepo = {
    // Crear una nueva versión de documento
    async createVersion(versionData) {
        const [result] = await pool.execute(
            `INSERT INTO VersionDocumento (numero, fecha, contenido, documento_id)
       VALUES (:numero, :fecha, :contenido, :documentoId)`,
            versionData
        );
        return { id: result.insertId, ...versionData };
    },

    // Obtener todas las versiones de un documento
    async getAllVersions(documentoId) {
        const [rows] = await pool.query(
            `SELECT id, numero, fecha, contenido
       FROM VersionDocumento
       WHERE documento_id = :documentoId
       ORDER BY fecha DESC`,
            { documentoId }
        );
        return rows;
    },

    // Obtener una versión específica por ID
    async getVersionById(id) {
        const [rows] = await pool.query(
            `SELECT id, numero, fecha, contenido
       FROM VersionDocumento
       WHERE id = :id`,
            { id }
        );
        return rows[0] || null;
    },

    // Actualizar una versión de documento
    async updateVersion(id, updateData) {
        const fields = [];
        const params = { id };
        for (const [key, value] of Object.entries(updateData)) {
            fields.push(`${key} = :${key}`);
            params[key] = value;
        }
        if (!fields.length) return this.getVersionById(id);
        await pool.execute(
            `UPDATE VersionDocumento SET ${fields.join(", ")} WHERE id = :id`,
            params
        );
        return this.getVersionById(id);
    },

    // Eliminar una versión de documento
    async removeVersion(id) {
        await pool.execute(`DELETE FROM VersionDocumento WHERE id = :id`, { id });
    },
};
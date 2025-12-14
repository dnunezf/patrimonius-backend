//src/repositories/versionDocumentoRepo.js
import { pool } from "../db/pool.js";

/** VersionDocumento repository. SQL-only. */
export const versionDocumentoRepo = {

    async findById(id) {
        const [rows] = await pool.query(
            `SELECT id, fecha, contenido, documento_id, nombre_versionado
         FROM Version_Documento WHERE id = ?`,
            [id]
        );
        return rows[0] || null;
    },

    async listByDocumento(documentoId) {
        const [rows] = await pool.query(
            `SELECT id, fecha, nombre_versionado
         FROM Version_Documento
        WHERE documento_id = ?
        ORDER BY fecha DESC, id DESC`,
            [documentoId]
        );
        return rows;
    },

    async countByDocumento(documentoId) {
        const [rows] = await pool.query(
            `SELECT COUNT(1) AS n FROM Version_Documento WHERE documento_id = ?`,
            [documentoId]
        );
        return rows[0]?.n ?? 0;
    },

    async getLatest(documentoId) {
        const [rows] = await pool.query(
            `SELECT id, fecha, nombre_versionado
         FROM Version_Documento
        WHERE documento_id = ?
        ORDER BY fecha DESC, id DESC
        LIMIT 1`,
            [documentoId]
        );
        return rows[0] || null;
    },

    async insert({ documento_id, contenido, fecha, nombre_versionado }) {
        const [res] = await pool.query(
            `INSERT INTO Version_Documento (documento_id, contenido, fecha, nombre_versionado)
       VALUES (?, ?, ?, ?)`,
            [documento_id, contenido, fecha, nombre_versionado ?? null]
        );
        return res.insertId;
    },

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
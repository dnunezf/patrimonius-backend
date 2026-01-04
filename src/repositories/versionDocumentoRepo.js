//src/repositories/versionDocumentoRepo.js
import { pool } from "../db/pool.js";

/** VersionDocumento repository. SQL-only. */
export const versionDocumentoRepo = {
    async findById(id) {
        const [rows] = await pool.query(
            `SELECT id, fecha, contenido, documento_id, nombre_versionado
       FROM Version_Documento
       WHERE id = ?`,
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

    // ==========================
    // Compatibilidad: tus métodos "legacy"
    // (pero arreglados para que usen Version_Documento y ? params)
    // ==========================

    // Crear una nueva versión de documento
    async createVersion(versionData) {
        const { fecha, contenido, documentoId, documento_id, nombre_versionado } = versionData;
        const docId = documento_id ?? documentoId;

        const id = await this.insert({
            documento_id: docId,
            contenido,
            fecha,
            nombre_versionado,
        });

        return { id, ...versionData, documento_id: docId };
    },

    // Obtener todas las versiones de un documento
    async getAllVersions(documentoId) {
        const [rows] = await pool.query(
            `SELECT id, fecha, contenido, documento_id, nombre_versionado
       FROM Version_Documento
       WHERE documento_id = ?
       ORDER BY fecha DESC, id DESC`,
            [documentoId]
        );
        return rows;
    },

    // Obtener una versión específica por ID
    async getVersionById(id) {
        return this.findById(id);
    },

    // Actualizar una versión de documento (solo campos permitidos)
    async updateVersion(id, updateData) {
        const allowed = ["fecha", "contenido", "nombre_versionado"];
        const fields = [];
        const params = [];

        for (const [key, value] of Object.entries(updateData || {})) {
            if (!allowed.includes(key)) continue;
            fields.push(`${key} = ?`);
            params.push(value);
        }

        if (!fields.length) return this.getVersionById(id);

        params.push(id);
        await pool.query(
            `UPDATE Version_Documento SET ${fields.join(", ")} WHERE id = ?`,
            params
        );

        return this.getVersionById(id);
    },

    // Eliminar una versión de documento
    async removeVersion(id) {
        await pool.query(`DELETE FROM Version_Documento WHERE id = ?`, [id]);
    },

    // Helper: generar nombre versionado tipo V1, V2, V3... basado en COUNT
    async getNextVersionName(documento_id, suffix = "") {
        const count = await this.countByDocumento(documento_id);
        const next = count + 1;
        return `V${next}${suffix}`;
    },
};

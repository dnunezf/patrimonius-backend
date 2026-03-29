// src/repositories/indiceRepo.js
import { pool } from "../db/pool.js";

function asInt(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Índice Electrónico Repository. SQL-only. */
export const indiceRepo = {
    async createExpedienteIndex({ hash, fecha, expedienteId, firmaId = null }) {
        const [result] = await pool.execute(
            `INSERT INTO Indice_Electronico (hash, fecha, firma_id, expediente_id)
             VALUES (?, ?, ?, ?)`,
            [hash, fecha, firmaId, expedienteId]
        );

        return this.getIndexById(result.insertId);
    },

    async getAllIndices() {
        const [rows] = await pool.query(
            `SELECT
                 ie.id,
                 ie.hash,
                 ie.fecha,
                 ie.firma_id,
                 ie.expediente_id,
                 e.codigo AS expediente_codigo,
                 e.nombre AS expediente_nombre,
                 e.estado AS expediente_estado
             FROM Indice_Electronico ie
                      LEFT JOIN Expediente e ON e.id = ie.expediente_id
             ORDER BY ie.id DESC`
        );

        return rows;
    },

    async getIndexById(id) {
        const indexId = asInt(id);
        if (!indexId) return null;

        const [rows] = await pool.query(
            `SELECT
                 ie.id,
                 ie.hash,
                 ie.fecha,
                 ie.firma_id,
                 ie.expediente_id,
                 e.codigo AS expediente_codigo,
                 e.nombre AS expediente_nombre,
                 e.estado AS expediente_estado
             FROM Indice_Electronico ie
                      LEFT JOIN Expediente e ON e.id = ie.expediente_id
             WHERE ie.id = ?`,
            [indexId]
        );

        return rows[0] || null;
    },

    async getIndexByHash(hash) {
        const [rows] = await pool.query(
            `SELECT
                 ie.id,
                 ie.hash,
                 ie.fecha,
                 ie.firma_id,
                 ie.expediente_id,
                 e.codigo AS expediente_codigo,
                 e.nombre AS expediente_nombre,
                 e.estado AS expediente_estado
             FROM Indice_Electronico ie
                      LEFT JOIN Expediente e ON e.id = ie.expediente_id
             WHERE ie.hash = ?
                 LIMIT 1`,
            [hash]
        );

        return rows[0] || null;
    },

    async getIndexByExpedienteId(expedienteId) {
        const safeExpedienteId = asInt(expedienteId);
        if (!safeExpedienteId) return null;

        const [rows] = await pool.query(
            `SELECT
                 ie.id,
                 ie.hash,
                 ie.fecha,
                 ie.firma_id,
                 ie.expediente_id,
                 e.codigo AS expediente_codigo,
                 e.nombre AS expediente_nombre,
                 e.estado AS expediente_estado
             FROM Indice_Electronico ie
                      LEFT JOIN Expediente e ON e.id = ie.expediente_id
             WHERE ie.expediente_id = ?
             ORDER BY ie.id DESC
                 LIMIT 1`,
            [safeExpedienteId]
        );

        return rows[0] || null;
    },

    async getIndicesByExpedienteId(expedienteId) {
        const safeExpedienteId = asInt(expedienteId);
        if (!safeExpedienteId) return [];

        const [rows] = await pool.query(
            `SELECT
                 ie.id,
                 ie.hash,
                 ie.fecha,
                 ie.firma_id,
                 ie.expediente_id,
                 e.codigo AS expediente_codigo,
                 e.nombre AS expediente_nombre,
                 e.estado AS expediente_estado
             FROM Indice_Electronico ie
                      LEFT JOIN Expediente e ON e.id = ie.expediente_id
             WHERE ie.expediente_id = ?
             ORDER BY ie.id DESC`,
            [safeExpedienteId]
        );

        return rows;
    },

    async getExpedienteById(expedienteId) {
        const safeExpedienteId = asInt(expedienteId);
        if (!safeExpedienteId) return null;

        const [rows] = await pool.query(
            `SELECT
                 id,
                 codigo,
                 nombre,
                 estado,
                 fecha_creacion,
                 fecha_cierre,
                 unidad_id,
                 serie_id,
                 subserie_id,
                 created_by
             FROM Expediente
             WHERE id = ?`,
            [safeExpedienteId]
        );

        return rows[0] || null;
    },

    async getDocumentosByExpedienteId(expedienteId) {
        const safeExpedienteId = asInt(expedienteId);
        if (!safeExpedienteId) return [];

        const [rows] = await pool.query(
            `SELECT
          d.id,
          d.titulo,
          d.estado,
          d.numero_serie,
          d.expediente_id,
          d.numero_firmas,
          d.firmas_obtenidas,
          d.fecha,
          d.contenido_hash
       FROM Documento d
       WHERE d.expediente_id = ?
       ORDER BY d.id ASC`,
            [safeExpedienteId]
        );

        return rows;
    },

    async closeExpediente(expedienteId) {
        const safeExpedienteId = asInt(expedienteId);
        if (!safeExpedienteId) return false;

        const [result] = await pool.execute(
            `UPDATE Expediente
             SET estado = 'CERRADO',
                 fecha_cierre = NOW()
             WHERE id = ?
               AND estado = 'ACTIVO'`,
            [safeExpedienteId]
        );

        return result.affectedRows > 0;
    },
};
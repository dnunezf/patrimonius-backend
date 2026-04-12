// src/repositories/indiceRepo.js
import { pool } from "../db/pool.js";

function asInt(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Índice Electrónico Repository. SQL-only. */
export const indiceRepo = {
    async createExpedienteIndex({
                                    hash,
                                    fecha,
                                    expedienteId,
                                    firmaId = null,
                                    jsonPath = null,
                                    actaPdfPath = null,
                                }) {
        const [result] = await pool.execute(
            `INSERT INTO Indice_Electronico (
                hash,
                fecha,
                firma_id,
                expediente_id,
                json_path,
                acta_pdf_path
            )
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [hash, fecha, firmaId, expedienteId, jsonPath, actaPdfPath]
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
                 ie.json_path,
                 ie.acta_pdf_path,
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
                 ie.json_path,
                 ie.acta_pdf_path,
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
                 ie.json_path,
                 ie.acta_pdf_path,
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
                 ie.json_path,
                 ie.acta_pdf_path,
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
                 ie.json_path,
                 ie.acta_pdf_path,
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
                 e.id,
                 e.codigo,
                 e.nombre,
                 e.estado,
                 e.fecha_creacion,
                 e.fecha_cierre,
                 e.unidad_id,
                 e.serie_id,
                 e.subserie_id,
                 e.created_by,
                 u.nombre AS unidad_nombre,
                 s.nombre AS serie_nombre,
                 ss.nombre AS subserie_nombre
             FROM Expediente e
                      INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
                      INNER JOIN Serie s ON s.id = e.serie_id
                      LEFT JOIN Subserie ss ON ss.id = e.subserie_id
             WHERE e.id = ?`,
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
          d.contenido_hash,
          d.fecha AS fecha_incorporacion
       FROM Documento d
       WHERE d.expediente_id = ?
       ORDER BY d.id ASC`,
            [safeExpedienteId]
        );

        return rows;
    },

    async updateIndexFiles(id, { jsonPath = null, actaPdfPath = null }) {
        const indexId = asInt(id);
        if (!indexId) return null;

        await pool.query(
            `UPDATE Indice_Electronico
         SET json_path = ?,
             acta_pdf_path = ?
         WHERE id = ?`,
            [jsonPath, actaPdfPath, indexId]
        );

        return this.getIndexById(indexId);
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
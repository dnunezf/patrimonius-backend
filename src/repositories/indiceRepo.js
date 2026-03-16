//src/repositories/indiceRepo.js
import { pool } from "../db/pool.js";
function asInt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
/** Índice Electrónico Repository. SQL-only. */
export const indiceRepo = {
    async createIndex({ hash, fecha, firmaId }) {
        const [result] = await pool.execute(
            `INSERT INTO Indice_Electronico (hash, fecha, firma_id)
       VALUES (?, ?, ?)`,
            [hash, fecha, firmaId]
        );

        return this.getIndexById(result.insertId);
    },

    async getAllIndices() {
        const [rows] = await pool.query(
            `SELECT ie.id, ie.hash, ie.fecha, ie.firma_id,
              fd.documento_id, fd.usuario_id
       FROM Indice_Electronico ie
       INNER JOIN Firma_Digital fd ON fd.id = ie.firma_id
       ORDER BY ie.id DESC`
        );
        return rows;
    },

    async getIndexById(id) {
        const indexId = asInt(id);
        if (!indexId) return null;

        const [rows] = await pool.query(
            `SELECT ie.id, ie.hash, ie.fecha, ie.firma_id,
              fd.documento_id, fd.usuario_id
       FROM Indice_Electronico ie
       INNER JOIN Firma_Digital fd ON fd.id = ie.firma_id
       WHERE ie.id = ?`,
            [indexId]
        );

        return rows[0] || null;
    },

    async getIndexByHash(hash) {
        const [rows] = await pool.query(
            `SELECT ie.id, ie.hash, ie.fecha, ie.firma_id,
              fd.documento_id, fd.usuario_id
       FROM Indice_Electronico ie
       INNER JOIN Firma_Digital fd ON fd.id = ie.firma_id
       WHERE ie.hash = ?`,
            [hash]
        );

        return rows[0] || null;
    },

    async getIndexByFirmaId(firmaId) {
        const safeFirmaId = asInt(firmaId);
        if (!safeFirmaId) return null;

        const [rows] = await pool.query(
            `SELECT ie.id, ie.hash, ie.fecha, ie.firma_id,
              fd.documento_id, fd.usuario_id
       FROM Indice_Electronico ie
       INNER JOIN Firma_Digital fd ON fd.id = ie.firma_id
       WHERE ie.firma_id = ?
       ORDER BY ie.id DESC`,
            [safeFirmaId]
        );

        return rows[0] || null;
    },

    async getIndicesByDocumentoId(documentoId) {
        const safeDocumentoId = asInt(documentoId);
        if (!safeDocumentoId) return [];

        const [rows] = await pool.query(
            `SELECT ie.id, ie.hash, ie.fecha, ie.firma_id,
              fd.documento_id, fd.usuario_id
       FROM Indice_Electronico ie
       INNER JOIN Firma_Digital fd ON fd.id = ie.firma_id
       WHERE fd.documento_id = ?
       ORDER BY ie.id DESC`,
            [safeDocumentoId]
        );

        return rows;
    },

    async documentoExists(documentoId) {
        const safeDocumentoId = asInt(documentoId);
        if (!safeDocumentoId) return false;

        const [rows] = await pool.query(
            `SELECT id, titulo, estado, numero_serie
       FROM Documento
       WHERE id = ?`,
            [safeDocumentoId]
        );

        return rows[0] || null;
    },

    async updateIndex(id, updateData) {
        const indexId = asInt(id);
        if (!indexId) return null;

        const fields = [];
        const values = [];

        if (updateData.hash !== undefined) {
            fields.push("hash = ?");
            values.push(updateData.hash);
        }

        if (updateData.fecha !== undefined) {
            fields.push("fecha = ?");
            values.push(updateData.fecha);
        }

        if (updateData.firmaId !== undefined) {
            fields.push("firma_id = ?");
            values.push(updateData.firmaId);
        }

        if (!fields.length) {
            return this.getIndexById(indexId);
        }

        values.push(indexId);

        await pool.execute(
            `UPDATE Indice_Electronico
       SET ${fields.join(", ")}
       WHERE id = ?`,
            values
        );

        return this.getIndexById(indexId);
    },

    async removeIndex(id) {
        const indexId = asInt(id);
        if (!indexId) return false;

        const [result] = await pool.execute(
            `DELETE FROM Indice_Electronico WHERE id = ?`,
            [indexId]
        );

        return result.affectedRows > 0;
    },
};
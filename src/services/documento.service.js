import { pool } from "../db/pool.js";

export const documentoService = {
    async getDocumentsFromProduction() {
        // MySQL2 returns [rows] not .rows
        const [rows] = await pool.query("SELECT * FROM VW_Vista_Documentos");
        return rows;
    },

    async getAllDocuments() {
        const [rows] = await pool.query(
            `SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha, c.nombre AS categoria
             FROM Documento d
                      LEFT JOIN Categoria c ON d.categoria_id = c.id
             ORDER BY d.fecha DESC`
        );
        return rows;
    }
};
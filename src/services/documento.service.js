// src/services/documentoService.js
import { permRepo } from "../repositories/permRepo.js";
import { pool } from '../db/pool.js';

/** Servicio para manejar documentos */
export const documentoService = {
    async editDocument(userId, documentId, content) {
        const permissions = await permRepo.getForUser(userId);

        // Validar que el usuario tenga permiso para editar
        if (!permissions.includes('EDIT')) {
            throw new Error("No tiene permiso para editar este documento.");
        }

        // Lógica para editar el documento (por ejemplo, actualizar en la base de datos)
        const updatedDocument = await documentRepo.updateContent(documentId, content);
        return updatedDocument;
    },

    async signDocument(userId, documentId) {
        const permissions = await permRepo.getForUser(userId);

        // Validar que el usuario tenga permiso para firmar
        if (!permissions.includes('SIGN')) {
            throw new Error("No tiene permiso para firmar este documento.");
        }

        // Lógica para firmar el documento
        const signedDocument = await documentRepo.sign(documentId);
        return signedDocument;
    },

    async getDocumentsFromProduction() {
        try {
            const [rows] = await pool.query("SELECT * FROM VW_Vista_Documentos");
            return rows;
        } catch (error) {
            throw new Error("Error fetching documents: " + error.message);
        }
    },

    async getAllDocuments() {
        try {
            const query = `
                SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha
                FROM Documento d
                ORDER BY d.fecha DESC
            `;
            const [rows] = await pool.query(query);  // Ejecuta la consulta SQL para obtener todos los documentos
            return rows;  // Retorna los resultados obtenidos
        } catch (error) {
            console.error('Error fetching documents:', error);
            throw new Error('Error fetching documents: ' + error.message);
        }
    },

    async getAccessibleDocuments(userId) {
        try {
            const sql = `
        SELECT *
        FROM VW_Documentos_Accesibles
        WHERE viewer_usuario_id = ?
        ORDER BY fecha_creacion DESC
      `;
            const [rows] = await pool.query(sql, [userId]);
            return rows;
        } catch (error) {
            throw new Error("Error fetching accessible documents: " + error.message);
        }
    },

};




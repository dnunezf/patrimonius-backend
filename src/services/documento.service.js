// src/services/documento.service.js
import {permRepo} from "../repositories/permRepo.js";
import {pool} from '../db/pool.js';
import {documentoRepo} from '../repositories/documentoRepo.js';

/** Servicio para manejar documentos */
export const documentoService = {
    async createDocument({titulo, categoria_id, plantilla_id, user_id, unidad_id}) {
        const now = new Date();
        //const dto = {
            //numero_serie: `DOC-${now.getTime()}`, // único y simple
            //titulo,
            //contenido: null, // por ahora vacío; más tarde cargaremos desde la plantilla_id
            //estado: 'CREACION', // está permitido en ENUM/ALTER TABLE
            //fecha: now,        // DATETIME requerido
            //unidad_id,         // obligatorio
            //usuario_id: user_id, // obligatorio
            //categoria_id: categoria_id ?? null
        //};
        const safeUserId   = Number(user_id)   || 1;
        const safeUnidadId = Number(unidad_id) || 1;
        const safeCatId =
            categoria_id !== undefined && categoria_id !== null && `${categoria_id}`.trim() !== ""
                ? Number(categoria_id)
                : null;

        const dto = {
            numero_serie: `DOC-${now.getTime()}`,
            titulo,
            contenido: null,          // por ahora vacío
            estado: "CREACION",       // <-- usa uno válido en tu ENUM
            fecha: now,
            unidad_id: safeUnidadId,  // FK debe existir
            usuario_id: safeUserId,   // FK debe existir
            categoria_id: safeCatId,  // puede ir null
        };

        const created = await documentoRepo.create(dto); // devuelve {id, ...dto}
        // si quieres relacionar plantilla:
        // await pool.query('INSERT INTO Documento_Plantilla (documento_id, plantilla_id) VALUES (?,?)', [created.id, plantilla_id]);
        return created;
    },

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
            const query =
                `SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha, c.nombre AS categoria
                  FROM Documento d
                    LEFT JOIN Categoria c ON d.categoria_id = c.id
                  ORDER BY d.fecha DESC`
            ;
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




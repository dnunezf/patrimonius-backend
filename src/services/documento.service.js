// src/services/documentoService.js
import { permRepo } from "../repositories/permRepo.js";
import { pool } from '../db/pool.js';
import { documentoRepo } from '../repositories/documentoRepo.js';
import { plantillaRepo } from '../repositories/plantillaRepo.js';
import { comentarioRepo } from '../repositories/cometariosRepo.js'; // <- shim/archivo que exporta comentarioRepo
import { bitacoraRepo } from '../repositories/bitacoraRepo.js';

function pad2(n){ return String(n).padStart(2,'0'); }
function tmpSerie() {
    const d = new Date(), r = Math.floor(Math.random()*9000)+1000;
    return `TMP-${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${r}`;
}
function officialIndex(docId) {
    const y = new Date().getFullYear();
    return `OFI_MNCR-DAF-AC-${docId}-${y}`;
}

/** Servicio para manejar documentos */
export const documentoService = {
    async editDocument(userId, documentId, content) {
        const permissions = await permRepo.getForUser(userId);
        if (!permissions.includes('EDIT')) {
            throw new Error("No tiene permiso para editar este documento.");
        }
        const updatedDocument = await documentoRepo.updateContent(documentId, content);
        return updatedDocument;
    },

    async signDocument(userId, documentId) {
        const permissions = await permRepo.getForUser(userId);
        if (!permissions.includes('SIGN')) {
            throw new Error("No tiene permiso para firmar este documento.");
        }
        const signedDocument = await documentoRepo.sign(documentId);
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
         ORDER BY d.fecha DESC`;
            const [rows] = await pool.query(query);
            return rows;
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

    /** HU-007: crear documento desde plantilla */
    async createFromPlantilla({ plantilla_id, titulo, categoria_id, confid_level, numero_firmas, usuario_id, unidad_id }) {
        if (!usuario_id) throw new Error('Usuario no autenticado');
        if (!unidad_id)  throw new Error('Unidad no determinada');
        if (!plantilla_id) throw new Error('Debe indicar plantilla_id');

        const pl = await plantillaRepo.findById(plantilla_id);
        if (!pl) throw new Error('Plantilla no encontrada');

        const numero_serie = tmpSerie();
        const documento_id = await documentoRepo.insertDocumento({
            numero_serie,
            titulo: titulo || `Borrador - ${pl.nombre} (${pl.version})`,
            contenido: null,
            estado: 'CREACION',
            firmas_obtenidas: 0,
            numero_firmas: Number(numero_firmas) || 0,
            confid_level: confid_level || 'INTERNAL',
            fecha: new Date(),
            unidad_id,
            usuario_id,
            categoria_id: categoria_id ?? null
        });

        await documentoRepo.linkPlantilla(documento_id, plantilla_id);
        await documentoRepo.insertVersion({
            documento_id,
            contenido: `Creado desde plantilla ${pl.nombre} v${pl.version}`,
            fecha: new Date()
        });

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: 'CREACION_DOCUMENTO',
            resultado: 'Documento creado (CREACION)',
            usuario_id,
            documento_id
        });
        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: 'CREACION',
            detalle: JSON.stringify({ accion_solicitada:'CREAR_DESDE_PLANTILLA', plantilla_id })
        });

        return { documento_id, numero_serie };
    },

    /** HU-007: preparar para firma (asigna índice oficial y cambia a FIRMA) */
    async prepareForSignature({ documento_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) throw new Error('Documento no existe');
        if (!['CREACION','EDICION','FIRMA_PARCIAL'].includes(doc.estado))
            throw new Error('Estado no válido para preparar firma');

        const oficial = officialIndex(documento_id);
        await documentoRepo.updateNumeroSerie(documento_id, oficial);
        await documentoRepo.updateEstado(documento_id, 'FIRMA');

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: 'PREPARAR_FIRMA',
            resultado: `Asignado índice oficial ${oficial}`,
            usuario_id,
            documento_id
        });
        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: 'FIRMA',
            detalle: JSON.stringify({ accion_solicitada:'ASIGNAR_INDICE_OFICIAL', numero_serie: oficial })
        });

        return { documento_id, numero_serie_oficial: oficial };
    },

    /** HU-008: última versión (para edición colaborativa) */
    async getLatestVersion(documento_id) {
        return documentoRepo.getLatestVersion(documento_id); // {id, fecha} | null
    },

    /** HU-008: guardar colaborativamente con control de versiones (optimistic) */
    async colabSave({ documento_id, usuario_id, contenido, base_version_id }) {
        if (!usuario_id) throw new Error('No autenticado');
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) throw new Error('Documento no existe');
        if (!['CREACION','EDICION'].includes(doc.estado)) {
            const e = new Error('Documento no editable'); e.code='STATE_ERROR'; throw e;
        }

        const latest = await documentoRepo.getLatestVersion(documento_id);
        if (latest && latest.id !== base_version_id) {
            const e = new Error('Versión desactualizada');
            e.code = 'VERSION_CONFLICT';
            e.details = { latest_version_id: latest.id };
            throw e;
        }

        const version_id = await documentoRepo.insertVersion({
            documento_id,
            contenido,
            fecha: new Date()
        });

        await documentoRepo.updateContenido(documento_id, contenido);
        await documentoRepo.updateEstado(documento_id, 'EDICION');

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: 'EDICION_DOCUMENTO',
            resultado: 'Nueva versión',
            usuario_id,
            documento_id
        });
        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: 'EDICION',
            detalle: JSON.stringify({ version_id })
        });

        return { version_id, next_version: version_id, conflict: false };
    },

    /** HU-016: comentarios internos */
    async listComentarios(documento_id) {
        return comentarioRepo.listByDocumento(documento_id);
    },
    async addComentario({ documento_id, usuario_id, descripcion }) {
        const comentario_id = await comentarioRepo.insert({ documento_id, usuario_id, descripcion });
        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: 'COMENTARIO_AGREGADO',
            resultado: 'Comentario registrado',
            usuario_id,
            documento_id
        });
        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: 'OTRA',
            recurso: 'COMENTARIO',
            parametros: JSON.stringify({ comentario_id })
        });
        return { comentario_id };
    },
    async resolveComentario({ comentario_id, usuario_id }) {
        const com = await comentarioRepo.findById(comentario_id);
        if (!com) throw new Error('Comentario no existe');
        await comentarioRepo.resolve(comentario_id);

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: 'COMENTARIO_RESUELTO',
            resultado: 'Marcado como resuelto',
            usuario_id,
            documento_id: com.documento_id
        });
        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: 'OTRA',
            recurso: 'COMENTARIO',
            parametros: JSON.stringify({ comentario_id })
        });
        return { ok: true };
    },
};

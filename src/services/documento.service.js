// src/services/documento.service.js
import { permRepo } from "../repositories/permRepo.js";
import { pool } from "../db/pool.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { plantillaRepo } from "../repositories/plantillaRepo.js";
import { comentarioRepo } from "../repositories/cometariosRepo.js"; // shim
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { documentMetadataService } from "./documentMetadata.service.js";

/** Helpers */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function tmpSerie() {
  const d = new Date(),
    r = Math.floor(Math.random() * 9000) + 1000;
  return `TMP-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(
    d.getDate()
  )}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${r}`;
}
function officialIndex(docId) {
  const y = new Date().getFullYear();
  return `OFI_MNCR-DAF-AC-${docId}-${y}`;
}

/** Document service */
export const documentoService = {
  async editDocument(userId, documentId, content) {
    const permissions = await permRepo.getForUser(userId);
    if (!permissions.includes("EDIT")) {
      throw new Error("No tiene permiso para editar este documento.");
    }
    const updatedDocument = await documentoRepo.updateContent(
      documentId,
      content
    );
    return updatedDocument;
  },

  async signDocument(userId, documentId) {
    const permissions = await permRepo.getForUser(userId);
    if (!permissions.includes("SIGN")) {
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
      const query = `
        SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha, c.nombre AS categoria
        FROM Documento d
        LEFT JOIN Categoria c ON d.categoria_id = c.id
        ORDER BY d.fecha DESC`;
      const [rows] = await pool.query(query);
      return rows;
    } catch (error) {
      console.error("Error fetching documents:", error);
      throw new Error("Error fetching documents: " + error.message);
    }
  },

  async getAccessibleDocuments(userId) {
    try {
      const sql = `
        SELECT *
        FROM VW_Documentos_Accesibles
        WHERE viewer_usuario_id = ?
        ORDER BY fecha_creacion DESC`;
      const [rows] = await pool.query(sql, [userId]);
      return rows;
    } catch (error) {
      throw new Error("Error fetching accessible documents: " + error.message);
    }
  },

  /** HU-007: create document from template */
  async createFromPlantilla({
    plantilla_id,
    titulo,
    categoria_id,
    confid_level,
    numero_firmas,
    usuario_id,
    unidad_id,
  }) {
    if (!usuario_id) throw new Error("Usuario no autenticado");
    if (!unidad_id) throw new Error("Unidad no determinada");
    if (!plantilla_id) throw new Error("Debe indicar plantilla_id");

    const pl = await plantillaRepo.findById(plantilla_id);
    if (!pl) throw new Error("Plantilla no encontrada");

    const numero_serie = tmpSerie();

    const nuevoDoc = await documentoRepo.insertDocumento({
      numero_serie,
      titulo: titulo || `Borrador - ${pl.nombre} (${pl.version})`,
      contenido: null,
      estado: "CREACION",
      firmas_obtenidas: 0,
      numero_firmas: Number(numero_firmas) || 0,
      confid_level: confid_level || "INTERNAL",
      fecha: new Date(),
      unidad_id,
      usuario_id,
      categoria_id: categoria_id ?? null,
    });

    await documentoRepo.linkPlantilla(nuevoDoc.id, plantilla_id);
    await documentoRepo.insertVersion({
      documento_id: nuevoDoc.id,
      contenido: `Creado desde plantilla ${pl.nombre} v${pl.version}`,
      fecha: new Date(),
    });

    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "CREACION_DOCUMENTO",
      resultado: "Documento creado (CREACION)",
      usuario_id,
      documento_id: nuevoDoc.id,
    });
    await bitacoraRepo.insertCiclo({
      id: baseId,
      evento: "CREACION",
      detalle: JSON.stringify({
        accion_solicitada: "CREAR_DESDE_PLANTILLA",
        plantilla_id,
      }),
    });

    // HU-011: first technical metadata capture (auto)
    await documentMetadataService.captureTechnical({
      documento_id: nuevoDoc.id,
      mimeType: "text/html",
      fileExt: "html",
      content: "", // no content yet
      storageUri: "",
      actorId: usuario_id,
    });

    return { documento_id: nuevoDoc.id, numero_serie };
  },

  /** HU-007: prepare for signature. Enforce HU-012 completeness. */
  async prepareForSignature({ documento_id, usuario_id }) {
    const doc = await documentoRepo.findById(documento_id);
    if (!doc) throw new Error("Documento no existe");
    if (!["CREACION", "EDICION", "FIRMA_PARCIAL"].includes(doc.estado))
      throw new Error("Estado no válido para preparar firma");

    // HU-012: must have complete descriptive metadata
    await documentMetadataService.ensureDescriptiveComplete(documento_id);

    const oficial = officialIndex(documento_id);
    await documentoRepo.updateNumeroSerie(documento_id, oficial);
    await documentoRepo.updateEstado(documento_id, "FIRMA");

    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "PREPARAR_FIRMA",
      resultado: `Asignado índice oficial ${oficial}`,
      usuario_id,
      documento_id,
    });
    await bitacoraRepo.insertCiclo({
      id: baseId,
      evento: "FIRMA",
      detalle: JSON.stringify({
        accion_solicitada: "ASIGNAR_INDICE_OFICIAL",
        numero_serie: oficial,
      }),
    });

    return { documento_id, numero_serie_oficial: oficial };
  },

  /** HU-008: latest version id for collab editing */
  async getLatestVersion(documento_id) {
    return documentoRepo.getLatestVersion(documento_id);
  },

  /** Collaborative save with optimistic control + HU-011 capture */
  async colabSave({ documento_id, usuario_id, contenido, base_version_id }) {
    if (!usuario_id) throw new Error("No autenticado");

    const doc = await documentoRepo.findById(documento_id);
    if (!doc) {
      const e = new Error("Documento no existe");
      throw e;
    }
    if (!["CREACION", "EDICION"].includes(doc.estado)) {
      const e = new Error("Documento no editable");
      e.code = "STATE_ERROR";
      throw e;
    }

    const currentContent = doc.contenido ?? "";
    const incomingContent = contenido ?? "";
    if (currentContent === incomingContent) {
      const latest = await documentoRepo.getLatestVersion(documento_id);
      return {
        version_id: latest?.id ?? 0,
        next_version: latest?.id ?? 0,
        conflict: false,
        saved: false,
        reason: "NO_CHANGES",
      };
    }

    const latest = await documentoRepo.getLatestVersion(documento_id);
    if (latest && latest.id !== base_version_id) {
      const e = new Error("Versión desactualizada");
      e.code = "VERSION_CONFLICT";
      e.details = { latest_version_id: latest.id };
      throw e;
    }

    const nextNumber = (await documentoRepo.countVersions(documento_id)) + 1;
    const nombre_versionado = `${doc.titulo}_V${nextNumber}`;

    const previousVersionId = await documentoRepo.insertVersion({
      documento_id,
      contenido: currentContent,
      fecha: new Date(),
      nombre_versionado,
    });

    await documentoRepo.updateContenido(documento_id, incomingContent);
    await documentoRepo.updateEstado(documento_id, "EDICION");

    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "EDICION_DOCUMENTO",
      resultado: `Nueva versión ${nombre_versionado}`,
      usuario_id,
      documento_id,
    });
    await bitacoraRepo.insertCiclo({
      id: baseId,
      evento: "EDICION",
      detalle: JSON.stringify({
        version_id: previousVersionId,
        nombre_versionado,
      }),
    });

    // HU-011: capture technical metadata after content change
    await documentMetadataService.captureTechnical({
      documento_id,
      mimeType: "text/html",
      fileExt: "html",
      content: incomingContent,
      storageUri: "",
      actorId: usuario_id,
    });

    return {
      version_id: previousVersionId,
      next_version: previousVersionId,
      conflict: false,
      saved: true,
      nombre_versionado,
    };
  },

  /** HU-010: restore previous version (keeps history) */
  async restoreVersion({ documento_id, version_id, usuario_id, motivo }) {
    if (!usuario_id) throw new Error("No autenticado");

    const doc = await documentoRepo.findById(documento_id);
    if (!doc) throw new Error("Documento no existe");

    // Must exist in repo (merge expects it). If not, implement in documentoRepo.
    const version = await documentoRepo.findVersionById(version_id);
    if (!version || Number(version.documento_id) !== Number(documento_id)) {
      const e = new Error("Versión no encontrada o no pertenece al documento");
      e.code = "NOT_FOUND";
      throw e;
    }

    const nextNumber = (await documentoRepo.countVersions(documento_id)) + 1;
    const nombre_versionado = `${doc.titulo}_V${nextNumber}_REST`;

    const version_creada_id = await documentoRepo.insertVersion({
      documento_id,
      contenido: version.contenido,
      fecha: new Date(),
      nombre_versionado,
    });

    await documentoRepo.updateContenido(documento_id, version.contenido);
    await documentoRepo.updateEstado(documento_id, "EDICION");

    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "DOC_VERSION_RESTORE",
      resultado: `Restaurada desde versión ${version_id}`,
      usuario_id,
      documento_id,
    });
    await bitacoraRepo.insertCiclo({
      id: baseId,
      evento: "EDICION",
      detalle: JSON.stringify({
        accion_solicitada: "RESTAURAR_VERSION",
        version_origen_id: version_id,
        version_creada_id: version_creada_id,
        motivo: motivo ?? "",
      }),
    });

    return {
      documento_id,
      version_origen_id: version_id,
      version_restaurada_id: version_creada_id,
      nombre_versionado,
    };
  },

  async listVersions(documento_id) {
    const [rows] = await pool.query(
      `SELECT v.id,
              v.fecha,
              v.nombre_versionado
         FROM Version_Documento v
        WHERE v.documento_id = ?
        ORDER BY v.fecha DESC, v.id DESC`,
      [documento_id]
    );
    return rows;
  },

  /** HU-016: comments */
  async listComentarios(documento_id) {
    return comentarioRepo.listByDocumento(documento_id);
  },
  async addComentario({ documento_id, usuario_id, descripcion }) {
    const comentario_id = await comentarioRepo.insert({
      documento_id,
      usuario_id,
      descripcion,
    });
    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "COMENTARIO_AGREGADO",
      resultado: "Comentario registrado",
      usuario_id,
      documento_id,
    });
    await bitacoraRepo.insertActividad({
      id: baseId,
      actividad: "OTRA",
      recurso: "COMENTARIO",
      parametros: JSON.stringify({ comentario_id }),
    });
    return { comentario_id };
  },
  async resolveComentario({ comentario_id, usuario_id }) {
    const com = await comentarioRepo.findById(comentario_id);
    if (!com) throw new Error("Comentario no existe");
    await comentarioRepo.resolve(comentario_id);

    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "COMENTARIO_RESUELTO",
      resultado: "Marcado como resuelto",
      usuario_id,
      documento_id: com.documento_id,
    });
    await bitacoraRepo.insertActividad({
      id: baseId,
      actividad: "OTRA",
      recurso: "COMENTARIO",
      parametros: JSON.stringify({ comentario_id }),
    });
    return { ok: true };
  },

  async getContenido({ documento_id, usuario_id }) {
    const [rows] = await pool.query(
      `SELECT 1 FROM VW_Documentos_Accesibles
       WHERE viewer_usuario_id = ? AND documento_id = ? LIMIT 1`,
      [usuario_id, documento_id]
    );
    if (!rows.length) {
      const e = new Error("Acceso no autorizado al documento");
      e.code = "FORBIDDEN";
      throw e;
    }

    const doc = await documentoRepo.getContenido(documento_id);
    if (!doc) {
      const e = new Error("Documento no existe");
      e.code = "NOT_FOUND";
      throw e;
    }

    const latest = await documentoRepo.getLatestVersion(documento_id);

    return {
      documento_id,
      titulo: doc.titulo,
      estado: doc.estado,
      contenido: doc.contenido ?? "",
      latest_version_id: latest?.id ?? 0,
    };
  },
};

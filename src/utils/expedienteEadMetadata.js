import {
  generarEadXmlString as generarEadXmlHu035,
  generarEadTransferMetadata,
} from "../services/eadHu035.service.js";

function buildArtifactFromXml(xml) {
  const buffer = Buffer.from(xml, "utf8");

  return {
    fileName: "metadata.xml",
    filename: "metadata.xml",
    mimeType: "application/xml; charset=utf-8",
    contentType: "application/xml; charset=utf-8",
    xml,
    buffer,
  };
}

/**
 * Compatibilidad HU-032:
 * util usado por expedienteTransferenciaZip.js
 */
export async function resolverXmlEadExpediente(expedienteId, contexto = {}) {
  return generarEadXmlHu035(expedienteId, contexto);
}

/**
 * Nombre principal reutilizable.
 */
export async function generarEadXmlString(expedienteId, contexto = {}) {
  return generarEadXmlHu035(expedienteId, contexto);
}

export async function generarMetadataXmlString(expedienteId, contexto = {}) {
  return generarEadXmlHu035(expedienteId, contexto);
}

export async function generarMetadataXmlBuffer(expedienteId, contexto = {}) {
  const xml = await generarEadXmlHu035(expedienteId, contexto);
  return Buffer.from(xml, "utf8");
}

export async function generarMetadataXmlEad2002(expedienteId, contexto = {}) {
  const xml = await generarEadXmlHu035(expedienteId, contexto);
  return buildArtifactFromXml(xml);
}

export async function generarArchivoMetadataEad(expedienteId, contexto = {}) {
  const xml = await generarEadXmlHu035(expedienteId, contexto);
  return buildArtifactFromXml(xml);
}

export async function obtenerPreviewMetadataEad(expedienteId, contexto = {}) {
  return generarEadTransferMetadata(expedienteId, contexto);
}

export default {
  resolverXmlEadExpediente,
  generarEadXmlString,
  generarMetadataXmlString,
  generarMetadataXmlBuffer,
  generarMetadataXmlEad2002,
  generarArchivoMetadataEad,
  obtenerPreviewMetadataEad,
};
import crypto from "crypto";
import { eadExportRepo } from "../repositories/eadExport.repository.js";
import {
  buildEad2002Tree,
  buildEad2002Xml,
} from "../utils/ead2002XmlBuilder.js";

const ADMIN_ROLE_ID = 1;
const ARCHIVE_ROLE_ID = 3;

function pickFirst(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function safeJsonParse(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeArrayFromJson(value) {
  const parsed = safeJsonParse(value, []);
  return Array.isArray(parsed)
    ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeDateOnly(value) {
  const iso = normalizeDate(value);
  return iso ? iso.slice(0, 10) : null;
}

function bytesToHuman(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let idx = 0;

  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

function normalizeAccessLabel(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  switch (raw) {
    case "PUBLIC":
      return "Público";
    case "INTERNAL":
      return "Interno";
    case "HIGH":
      return "Alto";
    case "RESTRICTED":
      return "Restringido";
    default:
      return "No definido";
  }
}

function normalizeStateLabel(value, hasIntake) {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if (raw === "ARCHIVADO" && hasIntake) return "conservación";
  if (raw === "ARCHIVADO") return "archivado";
  return raw.toLowerCase() || "desconocido";
}

function sanitizeFileName(value) {
  return String(value || "documento")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

function hasArchivistRole(actor) {
  const roleNames = [
    String(actor?.role || ""),
    String(actor?.rol || ""),
    String(actor?.roleName || ""),
  ]
    .map((item) => item.trim().toUpperCase().replace(/\s+/g, "_"))
    .filter(Boolean);

  const roleIds = Array.isArray(actor?.rolIds)
    ? actor.rolIds.map((item) => Number(item)).filter(Number.isFinite)
    : [];

  const singleRoleId = Number(actor?.rolId);
  if (Number.isFinite(singleRoleId)) roleIds.push(singleRoleId);

  const dedupedIds = Array.from(new Set(roleIds));

  return (
    actor?.isMaster === true ||
    dedupedIds.includes(ADMIN_ROLE_ID) ||
    dedupedIds.includes(ARCHIVE_ROLE_ID) ||
    roleNames.includes("ADMINISTRADOR") ||
    roleNames.includes("ADMIN") ||
    roleNames.includes("ARCHIVADOR") ||
    roleNames.includes("ARCHIVISTA")
  );
}

function assertAuthorizedActor(actor) {
  const actorId = Number(actor?.id || actor?.userId || actor?.usuario_id || 0);
  if (!actorId) {
    const error = new Error("Sesión no válida.");
    error.code = "UNAUTHORIZED";
    throw error;
  }

  if (!hasArchivistRole(actor)) {
    const error = new Error(
      "No tiene permisos para exportar documentos en formato EAD 2002.",
    );
    error.code = "FORBIDDEN";
    throw error;
  }

  return actorId;
}

function normalizePreviewContext(row, metadataMap, actorName) {
  const payloadSnapshot = safeJsonParse(row.payload_snapshot, {});
  const metadata = payloadSnapshot?.metadata || {};
  const classification = payloadSnapshot?.classification || {};
  const retention = payloadSnapshot?.retention || {};

  const title =
    pickFirst(metadataMap, [
      "FINAL_TITLE",
      "EDIT_MANUAL_TITLE",
      "DESC_TITLE",
    ]) ||
    row.titulo ||
    "";
  const officialCode =
    row.official_code ||
    pickFirst(metadataMap, ["CODIGO_OFICIAL", "FINAL_REFERENCE_CODE"]) ||
    row.numero_serie ||
    "";
  const documentType =
    pickFirst(metadataMap, [
      "FINAL_DOCUMENT_TYPE",
      "EDIT_MANUAL_DOCUMENT_TYPE",
      "DESC_PRELIM_CLASS",
    ]) ||
    metadata.documentType ||
    "";
  const author =
    pickFirst(metadataMap, [
      "DESC_AUTHOR",
      "EDIT_AUTO_CREATION_RESPONSIBLE",
      "ARCH_CONSERVATION_REGISTERED_BY_NAME",
    ]) ||
    row.creador_nombre_completo ||
    "";
  const producingUnit =
    pickFirst(metadataMap, ["FINAL_PRODUCING_UNIT", "ARCH_PRODUCING_UNIT"]) ||
    metadata.producingUnit ||
    row.unidad_nombre ||
    "";
  const accessLevel =
    row.intake_access_level ||
    pickFirst(metadataMap, ["FINAL_ACCESS_LEVEL", "ARCH_ACCESS_LEVEL"]) ||
    row.confid_level ||
    "";
  const format =
    pickFirst(metadataMap, [
      "FINAL_FORMAT",
      "TECH_MIME_TYPE",
      "TECH_FILE_EXT",
    ]) ||
    metadata.format ||
    "";
  const softwareVersion =
    pickFirst(metadataMap, [
      "FINAL_SOFTWARE_VERSION",
      "EDIT_AUTO_SOFTWARE_VERSION",
      "TECH_SOFTWARE",
    ]) ||
    metadata.softwareVersion ||
    "";
  const sizeBytesRaw =
    pickFirst(metadataMap, [
      "FINAL_SIZE_BYTES",
      "EDIT_AUTO_SIZE_BYTES",
      "TECH_SIZE_BYTES",
    ]) ||
    metadata.sizeBytes ||
    null;
  const sizeBytes =
    sizeBytesRaw != null && sizeBytesRaw !== "" ? Number(sizeBytesRaw) : null;

  const keywords = normalizeArrayFromJson(
    pickFirst(metadataMap, [
      "FINAL_KEYWORDS_JSON",
      "EDIT_MANUAL_KEYWORDS_JSON",
      "DESC_KEYWORDS_JSON",
    ]),
  );

  const signers = normalizeArrayFromJson(
    pickFirst(metadataMap, ["FINAL_SIGNERS_JSON"]),
  );

  const signedAt = normalizeArrayFromJson(
    pickFirst(metadataMap, ["FINAL_SIGNED_AT_JSON"]),
  );

  const eadId = `${officialCode || row.id}/eadid`;
  const generatedAt = new Date().toISOString();
  const fileName = `${sanitizeFileName(officialCode || row.numero_serie)}_EAD2002.xml`;

  return {
    documentId: Number(row.id),
    title,
    officialCode,
    eadId,
    state: row.estado,
    stateLabel: normalizeStateLabel(row.estado, Boolean(row.intake_id)),
    accessLevel,
    accessLevelLabel: normalizeAccessLabel(accessLevel),
    createdAt: normalizeDate(row.fecha),
    generatedAt,
    fileName,

    repositoryName: "Museo Nacional de Costa Rica",
    exportedByName: actorName || "Sistema Patrimonius",

    unitName: row.unidad_nombre || "",
    categoryName: row.categoria_nombre || "",
    author,
    documentType,
    producingUnit,

    serieName: row.serie_nombre || classification.label || "",
    serieCode: row.serie_codigo || "",
    subserieName: row.subserie_nombre || "",
    subserieCode: row.subserie_codigo || "",
    expedienteName: row.expediente_nombre || "",
    expedienteCode: row.expediente_codigo || "",

    classificationCode:
      row.classification_code ||
      classification.code ||
      pickFirst(metadataMap, [
        "FINAL_CLASSIFICATION_CODE",
        "ARCH_CLASSIFICATION_CODE",
      ]) ||
      "",
    classificationLabel:
      row.classification_label ||
      classification.label ||
      pickFirst(metadataMap, [
        "FINAL_CLASSIFICATION_LABEL",
        "ARCH_CLASSIFICATION_LABEL",
      ]) ||
      "",

    retentionYears:
      row.retention_years != null
        ? Number(row.retention_years)
        : retention.years != null
          ? Number(retention.years)
          : null,
    retentionStartDate:
      normalizeDate(row.retention_start_date) ||
      normalizeDate(retention.startDateISO) ||
      normalizeDate(row.fecha_inicio_conservacion),
    retentionEndDate:
      normalizeDate(row.retention_end_date) ||
      normalizeDate(retention.endDateISO) ||
      normalizeDate(row.fecha_vencimiento),
    trackingEnabled:
      Number(row.tracking_enabled || 0) === 1 ||
      retention.trackingEnabled === true,

    format,
    softwareVersion,
    sizeBytes,
    sizeHuman: bytesToHuman(sizeBytes),
    keywords,
    signers,
    signedAt,

    lastExportedAt:
      pickFirst(metadataMap, ["EAD2002_LAST_EXPORTED_AT"]) || null,
    lastExportedByName:
      pickFirst(metadataMap, ["EAD2002_LAST_EXPORTED_BY_NAME"]) || null,
  };
}

function validatePreviewContext(context, row) {
  const hasDocumentState =
    String(row?.estado || "")
      .trim()
      .toUpperCase() === "ARCHIVADO";
  const hasIntake = Boolean(row?.intake_id);
  const hasMetadata =
    Boolean(context.title) &&
    Boolean(context.officialCode) &&
    Boolean(context.documentType) &&
    Boolean(context.author) &&
    Boolean(context.format) &&
    context.sizeBytes != null &&
    Boolean(context.accessLevel) &&
    Boolean(context.createdAt);
  const hasStructure =
    Boolean(context.serieName) &&
    Boolean(context.expedienteName) &&
    Boolean(context.classificationCode || context.classificationLabel);

  const validations = [
    {
      key: "document_state",
      label: 'Documento en estado "conservación"',
      valid: hasDocumentState && hasIntake,
    },
    {
      key: "metadata_complete",
      label: "Metadatos completos (descriptivos, técnicos, gestión)",
      valid: hasMetadata,
    },
    {
      key: "archival_structure",
      label: "Estructura archivística válida",
      valid: hasStructure,
    },
  ];

  return {
    validations,
    canExport: validations.every((item) => item.valid),
  };
}

export const eadExportService = {
  async listExportableDocuments(rawFilters, actor) {
    assertAuthorizedActor(actor);
    const rows = await eadExportRepo.listConservationDocuments(
      rawFilters || {},
    );
    return rows;
  },

  async getPreview(documentId, actor) {
    const actorId = assertAuthorizedActor(actor);
    const row = await eadExportRepo.findDocumentContextById(documentId);

    if (!row) {
      const error = new Error("El documento solicitado no existe.");
      error.code = "NOT_FOUND";
      throw error;
    }

    const metadataMap = await eadExportRepo.getMetadataMap(documentId);
    const actorName =
      pickFirst(metadataMap, ["EAD2002_LAST_EXPORTED_BY_NAME"]) ||
      `Usuario ${actorId}`;

    const context = normalizePreviewContext(row, metadataMap, actorName);
    const validation = validatePreviewContext(context, row);
    const xmlPreview = buildEad2002Xml(context);
    const previewTree = buildEad2002Tree(context);

    return {
      document: {
        id: context.documentId,
        officialCode: context.officialCode,
        title: context.title,
        state: context.stateLabel,
        stateRaw: context.state,
        serieName: context.serieName,
        subserieName: context.subserieName || null,
        expedienteName: context.expedienteName,
        createdAtISO: context.createdAt,
        eadStatus: context.lastExportedAt ? "EXPORTADO" : "NO_EXPORTADO",
        lastExportedAt: context.lastExportedAt,
        lastExportedByName: context.lastExportedByName,
      },
      validations: validation.validations,
      canExport: validation.canExport,
      metadata: {
        descriptive: {
          title: context.title,
          author: context.author,
          documentType: context.documentType,
          serie: context.serieName,
          subserie: context.subserieName || "No aplica",
          expediente: context.expedienteName,
          keywords: context.keywords,
        },
        technical: {
          format: context.format,
          sizeBytes: context.sizeBytes,
          sizeHuman: context.sizeHuman,
          code: context.officialCode,
          softwareVersion: context.softwareVersion || null,
          signers: context.signers,
          signedAt: context.signedAt,
        },
        management: {
          state: context.stateLabel,
          createdAtISO: context.createdAt,
          retentionYears: context.retentionYears,
          retentionStartDateISO: normalizeDateOnly(context.retentionStartDate),
          retentionEndDateISO: normalizeDateOnly(context.retentionEndDate),
          unitResponsible: context.unitName,
          accessLevel: context.accessLevel,
          accessLevelLabel: context.accessLevelLabel,
          classificationCode: context.classificationCode,
          classificationLabel: context.classificationLabel,
        },
      },
      previewTree,
      xmlPreview,
      fileName: context.fileName,
    };
  },

  async exportXml(documentId, actor) {
    const actorId = assertAuthorizedActor(actor);
    const row = await eadExportRepo.findDocumentContextById(documentId);

    if (!row) {
      const error = new Error("El documento solicitado no existe.");
      error.code = "NOT_FOUND";
      throw error;
    }

    const metadataMap = await eadExportRepo.getMetadataMap(documentId);
    const actorName = String(actor?.email || "").trim() || `Usuario ${actorId}`;

    const context = normalizePreviewContext(row, metadataMap, actorName);
    const validation = validatePreviewContext(context, row);

    if (!validation.canExport) {
      const error = new Error(
        "El documento no puede exportarse porque no cumple todas las validaciones EAD 2002.",
      );
      error.code = "INCOMPLETE_EAD_EXPORT";
      error.status = 422;
      error.detail = validation.validations;
      throw error;
    }

    const xml = buildEad2002Xml(context);
    const buffer = Buffer.from(xml, "utf8");
    const xmlHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const generatedAt = new Date();

    await eadExportRepo.withTransaction(async (conn) => {
      await eadExportRepo.upsertMetadataMapTx(conn, documentId, {
        EAD2002_LAST_EXPORTED_AT: generatedAt.toISOString(),
        EAD2002_LAST_EXPORTED_BY: String(actorId),
        EAD2002_LAST_EXPORTED_BY_NAME: actorName,
        EAD2002_LAST_FILENAME: context.fileName,
        EAD2002_LAST_XML_SHA256: xmlHash,
        EAD2002_LAST_EADID: context.eadId,
      });

      await eadExportRepo.insertExportAuditTx(conn, {
        actorId,
        documentId,
        generatedAt,
        filename: context.fileName,
        xmlHash,
        eadId: context.eadId,
        officialCode: context.officialCode,
        title: context.title,
        state: row.estado,
      });

      await eadExportRepo.insertExpedienteAuditTx(conn, {
        expedienteId: row.expediente_real_id,
        actorId,
        generatedAt,
        documentId,
        officialCode: context.officialCode,
        filename: context.fileName,
      });
    });

    return {
      filename: context.fileName,
      mimeType: "application/xml; charset=utf-8",
      buffer,
    };
  },
};

import { eadExportRepo } from "../repositories/eadExport.repository.js";
import {
  buildEad2002Tree,
  buildEad2002Xml,
} from "../utils/ead2002XmlBuilder.js";

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

function normalizeNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value, fallback = "") {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
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

function buildActorName(contexto = {}, row = null) {
  const actor = contexto?.actor || contexto?.usuario || contexto?.user || {};

  return (
    normalizeText(
      pickFirst(actor, [
        "nombre_completo",
        "nombreCompleto",
        "displayName",
        "nombre",
        "email",
      ]),
      "",
    ) ||
    normalizeText(contexto?.exportedByName, "") ||
    normalizeText(contexto?.usuarioNombre, "") ||
    normalizeText(contexto?.usuarioEmail, "") ||
    normalizeText(row?.creador_nombre_completo, "") ||
    "Sistema Patrimonius"
  );
}

function normalizePreviewContext(row, metadataMap, actorName) {
  const payloadSnapshot = safeJsonParse(row?.payload_snapshot, {});
  const metadata = payloadSnapshot?.metadata || {};
  const classification = payloadSnapshot?.classification || {};
  const retention = payloadSnapshot?.retention || {};

  const title =
    pickFirst(metadataMap, [
      "FINAL_TITLE",
      "EDIT_MANUAL_TITLE",
      "DESC_TITLE",
    ]) ||
    row?.titulo ||
    "";

  const officialCode =
    row?.official_code ||
    pickFirst(metadataMap, ["CODIGO_OFICIAL", "FINAL_REFERENCE_CODE"]) ||
    row?.numero_serie ||
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
    row?.creador_nombre_completo ||
    "";

  const producingUnit =
    pickFirst(metadataMap, ["FINAL_PRODUCING_UNIT", "ARCH_PRODUCING_UNIT"]) ||
    metadata.producingUnit ||
    row?.unidad_nombre ||
    "";

  const accessLevel =
    row?.intake_access_level ||
    pickFirst(metadataMap, ["FINAL_ACCESS_LEVEL", "ARCH_ACCESS_LEVEL"]) ||
    row?.confid_level ||
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

  const eadId = `${officialCode || row?.id || "documento"}/eadid`;
  const generatedAt = new Date().toISOString();
  const fileName = `${sanitizeFileName(officialCode || row?.numero_serie || row?.id)}_EAD2002.xml`;

  return {
    documentId: Number(row?.id || 0),
    title,
    officialCode,
    eadId,
    state: row?.estado || "",
    stateLabel: normalizeStateLabel(row?.estado, Boolean(row?.intake_id)),
    accessLevel,
    accessLevelLabel: normalizeAccessLabel(accessLevel),
    createdAt: normalizeDate(row?.fecha),
    generatedAt,
    fileName,

    repositoryName: "Museo Nacional de Costa Rica",
    exportedByName: actorName || "Sistema Patrimonius",

    unitName: row?.unidad_nombre || "",
    categoryName: row?.categoria_nombre || "",
    author,
    documentType,
    producingUnit,

    serieName: row?.serie_nombre || classification.label || "",
    serieCode: row?.serie_codigo || "",
    subserieName: row?.subserie_nombre || "",
    subserieCode: row?.subserie_codigo || "",
    expedienteName: row?.expediente_nombre || "",
    expedienteCode: row?.expediente_codigo || "",

    classificationCode:
      row?.classification_code ||
      classification.code ||
      pickFirst(metadataMap, [
        "FINAL_CLASSIFICATION_CODE",
        "ARCH_CLASSIFICATION_CODE",
      ]) ||
      "",
    classificationLabel:
      row?.classification_label ||
      classification.label ||
      pickFirst(metadataMap, [
        "FINAL_CLASSIFICATION_LABEL",
        "ARCH_CLASSIFICATION_LABEL",
      ]) ||
      "",

    retentionYears:
      row?.retention_years != null
        ? Number(row.retention_years)
        : retention.years != null
          ? Number(retention.years)
          : null,
    retentionStartDate:
      normalizeDate(row?.retention_start_date) ||
      normalizeDate(retention.startDateISO) ||
      normalizeDate(row?.fecha_inicio_conservacion),
    retentionEndDate:
      normalizeDate(row?.retention_end_date) ||
      normalizeDate(retention.endDateISO) ||
      normalizeDate(row?.fecha_vencimiento),
    trackingEnabled:
      Number(row?.tracking_enabled || 0) === 1 ||
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

function extractExpedienteContext(contexto = {}) {
  const expediente = contexto?.expediente || {};
  const serie = contexto?.serie || {};
  const subserie = contexto?.subserie || {};
  const unidad = contexto?.unidad || contexto?.unidadOrganizacional || {};

  return {
    expedienteName: normalizeText(
      pickFirst(expediente, ["nombre", "name"]) || contexto?.expedienteName,
      "",
    ),
    expedienteCode: normalizeText(
      pickFirst(expediente, ["codigo", "code"]) || contexto?.expedienteCode,
      "",
    ),
    expedienteEstado: normalizeText(
      pickFirst(expediente, ["estado", "state"]) ||
        contexto?.expedienteEstado ||
        contexto?.state,
      "",
    ),
    expedienteCreatedAt:
      normalizeDate(
        pickFirst(expediente, ["fecha_creacion", "createdAt"]) ||
          contexto?.expedienteCreatedAt ||
          contexto?.createdAt,
      ) || null,

    serieName: normalizeText(
      pickFirst(serie, ["nombre", "name"]) ||
        expediente?.serie_nombre ||
        contexto?.serieName,
      "",
    ),
    serieCode: normalizeText(
      pickFirst(serie, ["codigo", "code"]) || contexto?.serieCode,
      "",
    ),

    subserieName: normalizeText(
      pickFirst(subserie, ["nombre", "name"]) ||
        expediente?.subserie_nombre ||
        contexto?.subserieName,
      "",
    ),
    subserieCode: normalizeText(
      pickFirst(subserie, ["codigo", "code"]) || contexto?.subserieCode,
      "",
    ),

    unitName: normalizeText(
      pickFirst(unidad, ["nombre", "name"]) ||
        expediente?.unidad_nombre ||
        contexto?.unitName,
      "",
    ),

    author: normalizeText(
      contexto?.author ||
        expediente?.creado_por ||
        contexto?.createdByName ||
        contexto?.ownerName,
      "",
    ),

    classificationCode: normalizeText(
      contexto?.classificationCode ||
        contexto?.classification_code ||
        contexto?.codigoClasificacion,
      "",
    ),
    classificationLabel: normalizeText(
      contexto?.classificationLabel ||
        contexto?.classification_label ||
        contexto?.etiquetaClasificacion,
      "",
    ),

    retentionYears:
      normalizeNumber(
        contexto?.retentionYears ||
          contexto?.retention_years ||
          expediente?.retention_years,
      ) ?? null,

    retentionStartDate:
      normalizeDate(
        contexto?.retentionStartDate ||
          contexto?.retention_start_date ||
          expediente?.fecha_inicio_vigencia,
      ) || null,

    retentionEndDate:
      normalizeDate(
        contexto?.retentionEndDate ||
          contexto?.retention_end_date ||
          expediente?.fecha_vencimiento,
      ) || null,

    trackingEnabled:
      contexto?.trackingEnabled === true || contexto?.tracking_enabled === true,

    accessLevel: normalizeText(
      contexto?.accessLevel ||
        contexto?.access_level ||
        expediente?.access_level,
      "",
    ),

    categoryName: normalizeText(contexto?.categoryName, ""),
  };
}

function buildEmptyBaseContext(actorName) {
  return {
    documentId: 0,
    title: "",
    officialCode: "",
    eadId: "",
    state: "",
    stateLabel: "",
    accessLevel: "",
    accessLevelLabel: "No definido",
    createdAt: null,
    generatedAt: new Date().toISOString(),
    fileName: "metadata.xml",
    repositoryName: "Museo Nacional de Costa Rica",
    exportedByName: actorName || "Sistema Patrimonius",
    unitName: "",
    categoryName: "",
    author: actorName || "Sistema Patrimonius",
    documentType: "",
    producingUnit: "",
    serieName: "",
    serieCode: "",
    subserieName: "",
    subserieCode: "",
    expedienteName: "",
    expedienteCode: "",
    classificationCode: "",
    classificationLabel: "",
    retentionYears: null,
    retentionStartDate: null,
    retentionEndDate: null,
    trackingEnabled: false,
    format: "",
    softwareVersion: "",
    sizeBytes: null,
    sizeHuman: "—",
    keywords: [],
    signers: [],
    signedAt: [],
    lastExportedAt: null,
    lastExportedByName: null,
  };
}

function mergeUniqueTextArray(...arrays) {
  return Array.from(
    new Set(
      arrays
        .flat()
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function buildTransferContext(
  expedienteId,
  baseContext,
  contexto = {},
  actorName,
) {
  const exp = extractExpedienteContext(contexto);

  const expedienteCode =
    exp.expedienteCode ||
    normalizeText(baseContext.expedienteCode, "") ||
    `EXPEDIENTE-${expedienteId}`;

  const expedienteName =
    exp.expedienteName ||
    normalizeText(baseContext.expedienteName, "") ||
    `Expediente ${expedienteId}`;

  const officialCode =
    normalizeText(
      contexto?.officialCode ||
        contexto?.packageCode ||
        `${expedienteCode}-TRANSFERENCIA`,
      "",
    ) || `${expedienteCode}-TRANSFERENCIA`;

  const generatedAt =
    normalizeDate(contexto?.generatedAt) || new Date().toISOString();

  const createdAt =
    exp.expedienteCreatedAt ||
    normalizeDate(contexto?.createdAt) ||
    baseContext.createdAt ||
    generatedAt;

  const sizeBytes =
    normalizeNumber(
      contexto?.zipSizeBytes ||
        contexto?.packageSizeBytes ||
        contexto?.totalSizeBytes ||
        contexto?.sizeBytes,
    ) ?? null;

  const accessLevel =
    exp.accessLevel || normalizeText(baseContext.accessLevel, "") || "INTERNAL";

  const context = {
    ...baseContext,

    title:
      normalizeText(
        contexto?.title ||
          contexto?.packageTitle ||
          `Paquete de transferencia del expediente ${expedienteName}`,
        "",
      ) || `Paquete de transferencia del expediente ${expedienteName}`,

    officialCode,
    eadId:
      normalizeText(
        contexto?.eadId ||
          `cr-mncr-${sanitizeFileName(expedienteCode)}-transferencia-ead2002`,
        "",
      ) || `cr-mncr-${sanitizeFileName(expedienteCode)}-transferencia-ead2002`,

    state:
      normalizeText(
        contexto?.state || exp.expedienteEstado || "TRANSFERIDO",
        "",
      ) || "TRANSFERIDO",

    stateLabel: "transferido",
    createdAt,
    generatedAt,
    fileName: "metadata.xml",

    repositoryName:
      normalizeText(contexto?.repositoryName, "") ||
      baseContext.repositoryName ||
      "Museo Nacional de Costa Rica",

    exportedByName:
      normalizeText(contexto?.exportedByName, "") ||
      actorName ||
      baseContext.exportedByName ||
      "Sistema Patrimonius",

    unitName: exp.unitName || baseContext.unitName || "",
    categoryName: exp.categoryName || baseContext.categoryName || "",
    author:
      exp.author ||
      normalizeText(contexto?.author, "") ||
      baseContext.author ||
      actorName ||
      "Sistema Patrimonius",

    documentType:
      normalizeText(contexto?.documentType, "") ||
      "Paquete ZIP de transferencia documental",

    producingUnit:
      normalizeText(contexto?.producingUnit, "") ||
      exp.unitName ||
      baseContext.producingUnit ||
      "",

    serieName: exp.serieName || baseContext.serieName || "",
    serieCode: exp.serieCode || baseContext.serieCode || "",
    subserieName: exp.subserieName || baseContext.subserieName || "",
    subserieCode: exp.subserieCode || baseContext.subserieCode || "",
    expedienteName,
    expedienteCode,

    classificationCode:
      exp.classificationCode || baseContext.classificationCode || "",
    classificationLabel:
      exp.classificationLabel ||
      baseContext.classificationLabel ||
      exp.serieName ||
      baseContext.serieName ||
      "",

    retentionYears: exp.retentionYears ?? baseContext.retentionYears ?? null,
    retentionStartDate:
      exp.retentionStartDate || baseContext.retentionStartDate || null,
    retentionEndDate:
      exp.retentionEndDate || baseContext.retentionEndDate || null,
    trackingEnabled:
      exp.trackingEnabled || baseContext.trackingEnabled || false,

    format: "application/zip",
    softwareVersion:
      normalizeText(contexto?.softwareVersion, "") || "Patrimonius",
    sizeBytes,
    sizeHuman: bytesToHuman(sizeBytes),
    accessLevel,
    accessLevelLabel: normalizeAccessLabel(accessLevel),

    keywords: mergeUniqueTextArray(
      baseContext.keywords || [],
      normalizeArrayFromJson(contexto?.keywords_json),
      Array.isArray(contexto?.keywords) ? contexto.keywords : [],
      ["transferencia documental", "EAD 2002", expedienteCode, expedienteName],
    ),
  };

  return context;
}

async function buildHu035TransferContext(expedienteId, contexto = {}) {
  const representativeRow =
    await eadExportRepo.findRepresentativeDocumentContextByExpedienteId(
      expedienteId,
    );

  const actorName = buildActorName(contexto, representativeRow);

  let baseContext = buildEmptyBaseContext(actorName);

  if (representativeRow?.id) {
    const metadataMap = await eadExportRepo.getMetadataMap(
      representativeRow.id,
    );
    baseContext = normalizePreviewContext(
      representativeRow,
      metadataMap,
      actorName,
    );
  }

  return buildTransferContext(expedienteId, baseContext, contexto, actorName);
}

export async function generarEadXmlString(expedienteId, contexto = {}) {
  const transferContext = await buildHu035TransferContext(
    expedienteId,
    contexto,
  );
  return buildEad2002Xml(transferContext);
}

export async function generarEadPreviewTree(expedienteId, contexto = {}) {
  const transferContext = await buildHu035TransferContext(
    expedienteId,
    contexto,
  );
  return buildEad2002Tree(transferContext);
}

export async function generarEadTransferMetadata(expedienteId, contexto = {}) {
  const transferContext = await buildHu035TransferContext(
    expedienteId,
    contexto,
  );
  return {
    context: transferContext,
    xml: buildEad2002Xml(transferContext),
    tree: buildEad2002Tree(transferContext),
  };
}

export const eadHu035Service = {
  generarEadXmlString,
  generarEadPreviewTree,
  generarEadTransferMetadata,
};

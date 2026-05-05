import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import {
  insertBitacoraExpedienteSafe,
  resolveBitacoraUsuarioId,
} from "../repositories/bitacoraExpedienteRepo.js";
import { conservationIntakeRepo } from "../repositories/conservationIntake.repository.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { notificacionRepo } from "../repositories/notificacionRepo.js";
import { userRepo } from "../repositories/userRepo.js";
import { DOCUMENT_TYPE_OPTIONS } from "../utils/metadataSchemas.js";
import {
  conservationAuditSchema,
  conservationIntakeSchema,
  conservationSearchSchema,
  duplicateCheckSchema,
  normalizeEmailsArray,
  normalizeKeywordsArray,
  referenceCodePreviewSchema,
} from "../validators/conservationIntake.schema.js";

const ALLOW_UNSIGNED_CONSERVATION =
  process.env.HU019_ALLOW_UNSIGNED_CONSERVATION !== "false";

const ALLOW_ANY_DOCUMENT_FOR_CONSERVATION =
  process.env.HU019_ALLOW_ANY_DOCUMENT_FOR_CONSERVATION !== "false";

const REFERENCE_INSTITUTION_CODE =
  String(process.env.REFERENCE_INSTITUTION_CODE || "MNCR")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || "MNCR";

const REFERENCE_UNIT_STOPWORDS = new Set([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "EL",
  "LOS",
  "Y",
  "E",
  "EN",
  "PARA",
  "POR",
  "CON",
  "SIN",
  "A",
  "AL",
]);

const LEGACY_KEYS = {
  TITLE: "DESC_TITLE",
  AUTHOR: "DESC_AUTHOR",
  KEYWORDS: "DESC_KEYWORDS_JSON",
  CLASS_CODE: "DESC_CLASSIFICATION_CODE",
  DOC_CODE: "TECH_DOCUMENT_CODE",
  SIZE: "TECH_SIZE_BYTES",
  MIME: "TECH_MIME_TYPE",
  EXT: "TECH_FILE_EXT",
  SOFTWARE: "TECH_SOFTWARE",
};

const EDIT_KEYS = {
  DOCUMENT_TYPE: "EDIT_MANUAL_DOCUMENT_TYPE",
  TITLE: "EDIT_MANUAL_TITLE",
  KEYWORDS: "EDIT_MANUAL_KEYWORDS_JSON",
  ACCESS_LEVEL: "EDIT_MANUAL_ACCESS_LEVEL",
  SIZE: "EDIT_AUTO_SIZE_BYTES",
  SOFTWARE: "EDIT_AUTO_SOFTWARE_VERSION",
};

const FINAL_KEYS = {
  FLOW: "FINAL_DOCUMENT_FLOW",
  REFERENCE_CODE: "FINAL_REFERENCE_CODE",
  DOCUMENT_TYPE: "FINAL_DOCUMENT_TYPE",
  PRODUCING_UNIT: "FINAL_PRODUCING_UNIT",
  TITLE: "FINAL_TITLE",
  KEYWORDS_JSON: "FINAL_KEYWORDS_JSON",
  SIZE_BYTES: "FINAL_SIZE_BYTES",
  FORMAT: "FINAL_FORMAT",
  SIGNERS_JSON: "FINAL_SIGNERS_JSON",
  SIGNED_AT_JSON: "FINAL_SIGNED_AT_JSON",
  ACCESS_LEVEL: "FINAL_ACCESS_LEVEL",
  PROCEDURE_TYPE: "FINAL_PROCEDURE_TYPE",

  CLASSIFICATION_SERIE_ID: "FINAL_CLASSIFICATION_SERIE_ID",
  CLASSIFICATION_SUBSERIE_ID: "FINAL_CLASSIFICATION_SUBSERIE_ID",
  CLASSIFICATION_EXPEDIENTE_ID: "FINAL_CLASSIFICATION_EXPEDIENTE_ID",
  CLASSIFICATION_CODE: "FINAL_CLASSIFICATION_CODE",
  CLASSIFICATION_LABEL: "FINAL_CLASSIFICATION_LABEL",

  RETENTION_RULE_ID: "FINAL_RETENTION_RULE_ID",
  RETENTION_RULE_LABEL: "FINAL_RETENTION_RULE_LABEL",
  RETENTION_YEARS: "FINAL_RETENTION_YEARS",
  START_DATE: "FINAL_START_DATE",
  END_DATE: "FINAL_END_DATE",

  SOFTWARE_VERSION: "FINAL_SOFTWARE_VERSION",
};

const FINAL_OUT_KEYS = {
  RECIPIENT_NAME_ROLE: "FINAL_OUT_RECIPIENT_NAME_ROLE",
  RECIPIENT_INSTITUTION: "FINAL_OUT_RECIPIENT_INSTITUTION",
  DISPATCH_EMAILS_JSON: "FINAL_OUT_DISPATCH_EMAILS_JSON",
  DISPATCHED_AT: "FINAL_OUT_DISPATCHED_AT",
  DISPATCH_RESPONSIBLE: "FINAL_OUT_DISPATCH_RESPONSIBLE",
};

const FINAL_IN_KEYS = {
  SENDER_NAME_ROLE: "FINAL_IN_SENDER_NAME_ROLE",
  SENDER_INSTITUTION: "FINAL_IN_SENDER_INSTITUTION",
  RECEIVED_AT: "FINAL_IN_RECEIVED_AT",
  RECEIPT_RESPONSIBLE: "FINAL_IN_RECEIPT_RESPONSIBLE",
};

const EAD_KEYS = {
  LAST_EXPORTED_AT: "EAD2002_LAST_EXPORTED_AT",
  LAST_EXPORTED_BY: "EAD2002_LAST_EXPORTED_BY",
  LAST_FILE_NAME: "EAD2002_LAST_FILE_NAME",
};

const ADMIN_ROLE_ID = 1;
const EDITOR_ROLE_ID = 2;
const ARCHIVIST_ROLE_ID = 3;

const SENSITIVE_ACCESS_LEVELS = new Set([
  "HIGH",
  "RESTRICTED",
  "PRIVATE",
  "PRIVADO",
  "RESTRINGIDO",
]);

function normalizeRoleNameForAccess(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function getActorId(actor) {
  return Number(actor?.id || actor?.userId || actor?.usuario_id || 0);
}

function getActorUnitId(actor) {
  return Number(
    actor?.unidadId ||
      actor?.unidad_id ||
      actor?.unitId ||
      actor?.unit_id ||
      actor?.unidad?.id ||
      0,
  );
}

function getActorRoleIds(actor) {
  const ids = [];

  if (Array.isArray(actor?.rolIds)) ids.push(...actor.rolIds);
  if (Array.isArray(actor?.roleIds)) ids.push(...actor.roleIds);

  ids.push(actor?.rolId, actor?.roleId, actor?.rol_id, actor?.role_id);

  return Array.from(
    new Set(ids.map((value) => Number(value)).filter(Number.isFinite)),
  );
}

function getActorRoleNames(actor) {
  const values = [];

  if (Array.isArray(actor?.roles)) values.push(...actor.roles);
  if (typeof actor?.roles === "string") values.push(...actor.roles.split(","));

  values.push(
    actor?.role,
    actor?.rol,
    actor?.roleName,
    actor?.rolNombre,
    actor?.nombre_rol,
    actor?.rol_nombre,
  );

  return Array.from(
    new Set(values.map(normalizeRoleNameForAccess).filter(Boolean)),
  );
}

function hasAdminRole(actor) {
  const ids = getActorRoleIds(actor);
  const names = getActorRoleNames(actor);

  return (
    ids.includes(ADMIN_ROLE_ID) ||
    names.includes("ADMIN") ||
    names.includes("ADMINISTRADOR")
  );
}

function hasEditorRole(actor) {
  const ids = getActorRoleIds(actor);
  const names = getActorRoleNames(actor);

  return ids.includes(EDITOR_ROLE_ID) || names.includes("EDITOR");
}

function hasArchivistRole(actor) {
  const ids = getActorRoleIds(actor);
  const names = getActorRoleNames(actor);

  return (
    ids.includes(ARCHIVIST_ROLE_ID) ||
    names.includes("ARCHIVISTA") ||
    names.includes("ARCHIVADOR")
  );
}

function isSensitiveAccessLevel(value) {
  return SENSITIVE_ACCESS_LEVELS.has(
    String(value || "")
      .trim()
      .toUpperCase(),
  );
}

function buildConservationAccessScope(actor) {
  const actorId = getActorId(actor);
  const unitId = getActorUnitId(actor);
  const isAdmin = actor?.isMaster === true || hasAdminRole(actor);
  const isArchivist = hasArchivistRole(actor);
  const isEditor = hasEditorRole(actor);

  return {
    actorId,
    unitId,
    canSeeAllUnits: isAdmin || isArchivist,
    limitToUnit: isEditor && !isAdmin && !isArchivist,
    canBypassPrivacy: isAdmin,
  };
}

function assertConservationActor(actor) {
  const actorId = getActorId(actor);

  if (!actorId) {
    const error = new Error("Unauthorized");
    error.code = "UNAUTHORIZED";
    throw error;
  }

  if (
    actor?.isMaster !== true &&
    !hasAdminRole(actor) &&
    !hasEditorRole(actor) &&
    !hasArchivistRole(actor)
  ) {
    const error = new Error(
      "No tiene permisos para acceder a gestión documental.",
    );
    error.code = "FORBIDDEN";
    throw error;
  }

  return actorId;
}

async function canActorManageConservationDocument(actor, documentRow) {
  const actorId = getActorId(actor);
  if (!actorId) return false;

  if (actor?.isMaster === true || hasAdminRole(actor)) return true;

  const actorUnitId = getActorUnitId(actor);
  const documentUnitId = Number(
    documentRow?.unitId ?? documentRow?.unidad_id ?? 0,
  );
  const documentCreatorId = Number(
    documentRow?.createdBy ?? documentRow?.usuario_id ?? 0,
  );

  const isEditor = hasEditorRole(actor);
  const isArchivist = hasArchivistRole(actor);

  if (!isEditor && !isArchivist) return false;

  if (isEditor && (!actorUnitId || documentUnitId !== actorUnitId)) {
    return false;
  }

  if (
    isSensitiveAccessLevel(
      documentRow?.accessLevel ?? documentRow?.confid_level,
    )
  ) {
    if (documentCreatorId === actorId) return true;

    return conservationIntakeRepo.actorHasExplicitDocumentAccess({
      documentId: Number(documentRow?.id),
      actorId,
    });
  }

  if (isArchivist) return true;

  return isEditor && actorUnitId > 0 && documentUnitId === actorUnitId;
}

function isOfficialCodeComplete(code) {
  return typeof code === "string" && code.trim().length >= 8;
}

function addYearsToDate(dateIso, years) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setFullYear(date.getFullYear() + Number(years || 0));
  return date.toISOString().slice(0, 10);
}

function calcularEstadoConservacion(fechaVencimiento) {
  const hoy = new Date();
  const venc = new Date(fechaVencimiento);

  hoy.setHours(0, 0, 0, 0);
  venc.setHours(0, 0, 0, 0);

  const diferenciaMs = venc.getTime() - hoy.getTime();
  const diasRestantes = Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) return "VENCIDO";
  if (diasRestantes <= 30) return "PROXIMO_A_VENCER";
  return "VIGENTE";
}

function pickFirst(map, keys) {
  for (const key of keys) {
    const value = map?.[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizeStringArray(arr = []) {
  return Array.from(
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function toNullableNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeUpperAscii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeComparableLabel(value) {
  return normalizeUpperAscii(value)
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTypeCode(documentType) {
  const normalized = normalizeComparableLabel(documentType);

  const exact = DOCUMENT_TYPE_OPTIONS.find(
    (item) => normalizeComparableLabel(item.value) === normalized,
  );
  if (exact?.code) return exact.code;

  if (/\bACTA\b/.test(normalized)) return "ACT";
  if (/\bBITACORA\b/.test(normalized)) return "BIT";
  if (/\bCERTIFICACION\b/.test(normalized)) return "CER";
  if (/\bCIRCULAR\b/.test(normalized)) return "CIR";
  if (/\bCONSTANCIA\b/.test(normalized)) return "CON";
  if (/\bCONTRATO\b/.test(normalized)) return "CONT";
  if (/\bCONVENIO\b/.test(normalized)) return "CONV";
  if (/\bESTUDIO\b/.test(normalized)) return "EST";
  if (/\bFICHA\b.*\bTECNICA\b/.test(normalized)) return "FIC";
  if (/\bINFORME\b/.test(normalized)) return "INF";
  if (/\bMEMORANDO\b|\bMEMO\b/.test(normalized)) return "MEM";
  if (/\bMINUTA\b.*\bREUNION\b/.test(normalized)) return "MIN";
  if (/\bOFICIO\b/.test(normalized)) return "OFI";
  if (/\bRESOLUCION\b/.test(normalized)) return "RES";
  if (/\bSOLICITUD\b/.test(normalized)) return "SOL";
  if (/\bPROYECTO\b|\bPROYECTOS\b/.test(normalized)) return "PRO";
  if (/\bCONTROL\b|\bCONTROLES\b/.test(normalized)) return "CONTR";
  if (/\bPLAN\b|\bPLANES\b/.test(normalized)) return "PLAN";

  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  if (!compact) return "DOC";
  return compact.slice(0, 4);
}

function buildUnitSuffix(producingUnit) {
  const normalized = normalizeComparableLabel(producingUnit);
  const words = normalized
    .split(" ")
    .filter(Boolean)
    .filter((word) => !REFERENCE_UNIT_STOPWORDS.has(word));

  if (!words.length) return "GEN";

  if (words.length === 1) {
    const one = words[0];
    return one.slice(0, 3) || "GEN";
  }

  const initials = words
    .slice(0, 4)
    .map((word) => word[0])
    .join("");

  if (initials.length >= 2) return initials;
  return words[0].slice(0, 3) || "GEN";
}

function buildUnitCode(producingUnit) {
  const suffix = buildUnitSuffix(producingUnit);
  return `${REFERENCE_INSTITUTION_CODE}-${suffix}`;
}

function formatReferenceCode({ typeCode, unitCode, sequence, year }) {
  return `${typeCode}-${unitCode}-${String(sequence).padStart(3, "0")}-${year}`;
}

function parseManagedReferenceCode(code, { typeCode, unitCode, year }) {
  const raw = String(code || "").trim();
  const regex = new RegExp(
    `^${escapeRegex(typeCode)}-${escapeRegex(unitCode)}-(\\d+)-${escapeRegex(String(year))}$`,
  );
  const match = raw.match(regex);
  if (!match) return null;

  return {
    referenceCode: raw,
    sequence: Number(match[1] || 0),
  };
}

async function resolveActorName(actorId) {
  if (!actorId) return "DESCONOCIDO";
  const actor = await userRepo.findById(actorId);
  if (!actor) return "DESCONOCIDO";
  return [actor.nombre, actor.apellido1, actor.apellido2]
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function logCycleEvent({
  actorId,
  documentId = null,
  accion,
  resultado,
  detail = {},
}) {
  const baseId = await bitacoraRepo.insertBase({
    fecha: new Date(),
    accion,
    resultado,
    usuario_id: actorId,
    documento_id: documentId,
  });

  await bitacoraRepo.insertCiclo({
    id: baseId,
    evento: "CONSERVACION",
    detalle: JSON.stringify(detail),
  });

  return baseId;
}

async function logUiActivity(_payload) {
  return null;
}

function buildFinalClassificationLabel({
  serie,
  subserie,
  expediente,
  fallback,
}) {
  const parts = [serie?.nombre, subserie?.nombre, expediente?.nombre].filter(
    Boolean,
  );

  if (parts.length) return parts.join(" / ");
  return String(fallback || "").trim();
}

function buildArchivalMetadataMap({
  payload,
  retentionRule,
  retentionEndDate,
  actorId,
  actorName,
  automatic,
  referenceCode,
}) {
  const keywords = normalizeKeywordsArray(payload.metadata.keywords);

  const map = {
    CODIGO_OFICIAL: referenceCode,
    [LEGACY_KEYS.DOC_CODE]: referenceCode,
    [LEGACY_KEYS.TITLE]: payload.metadata.title,
    [LEGACY_KEYS.AUTHOR]: automatic.creatorName,
    [LEGACY_KEYS.KEYWORDS]: JSON.stringify(keywords),
    [LEGACY_KEYS.CLASS_CODE]: payload.classification.code,

    ARCH_PRODUCING_UNIT: payload.metadata.producingUnit,
    ARCH_ACCESS_LEVEL: payload.metadata.accessLevel,
    ARCH_CLASSIFICATION_CODE: payload.classification.code,
    ARCH_CLASSIFICATION_LABEL: payload.classification.label,
    ARCH_RETENTION_RULE_ID: String(payload.retention.ruleId ?? 0),
    ARCH_RETENTION_RULE_LABEL: retentionRule.label,
    ARCH_RETENTION_YEARS: String(retentionRule.years),
    ARCH_RETENTION_START_DATE: payload.retention.startDateISO,
    ARCH_RETENTION_END_DATE: retentionEndDate,
    ARCH_TRACKING_ENABLED: String(Boolean(payload.retention.trackingEnabled)),
    ARCH_CONSERVATION_STATUS: "REGISTERED",
    ARCH_CONSERVATION_REGISTERED_AT: new Date().toISOString(),
    ARCH_CONSERVATION_REGISTERED_BY: String(actorId),

    [FINAL_KEYS.FLOW]: payload.metadata.documentFlow,
    [FINAL_KEYS.REFERENCE_CODE]: referenceCode,
    [FINAL_KEYS.DOCUMENT_TYPE]: payload.metadata.documentType,
    [FINAL_KEYS.PRODUCING_UNIT]: payload.metadata.producingUnit,
    [FINAL_KEYS.TITLE]: payload.metadata.title,
    [FINAL_KEYS.KEYWORDS_JSON]: JSON.stringify(keywords),
    [FINAL_KEYS.SIZE_BYTES]:
      automatic.sizeBytes != null ? String(automatic.sizeBytes) : "",
    [FINAL_KEYS.FORMAT]: automatic.format || "",
    [FINAL_KEYS.SIGNERS_JSON]: JSON.stringify(automatic.signers),
    [FINAL_KEYS.SIGNED_AT_JSON]: JSON.stringify(automatic.signedAt),
    [FINAL_KEYS.ACCESS_LEVEL]: payload.metadata.accessLevel,
    [FINAL_KEYS.PROCEDURE_TYPE]: payload.metadata.procedureType || "",

    [FINAL_KEYS.CLASSIFICATION_SERIE_ID]: String(
      payload.classification.serieId,
    ),
    [FINAL_KEYS.CLASSIFICATION_SUBSERIE_ID]:
      payload.classification.subserieId != null
        ? String(payload.classification.subserieId)
        : "",
    [FINAL_KEYS.CLASSIFICATION_EXPEDIENTE_ID]: String(
      payload.classification.expedienteId,
    ),
    [FINAL_KEYS.CLASSIFICATION_CODE]: payload.classification.code,
    [FINAL_KEYS.CLASSIFICATION_LABEL]: payload.classification.label,

    [FINAL_KEYS.RETENTION_RULE_ID]: String(payload.retention.ruleId ?? 0),
    [FINAL_KEYS.RETENTION_RULE_LABEL]: retentionRule.label,
    [FINAL_KEYS.RETENTION_YEARS]: String(retentionRule.years),
    [FINAL_KEYS.START_DATE]: payload.retention.startDateISO,
    [FINAL_KEYS.END_DATE]: retentionEndDate,

    [FINAL_KEYS.SOFTWARE_VERSION]: automatic.softwareVersion || "",

    [LEGACY_KEYS.SIZE]:
      automatic.sizeBytes != null ? String(automatic.sizeBytes) : "",
    [LEGACY_KEYS.SOFTWARE]: automatic.softwareVersion || "",
  };

  if (automatic.format) {
    map[LEGACY_KEYS.MIME] = automatic.format;
  }

  if (payload.metadata.documentFlow === "PRODUCED_SENT" && payload.outgoing) {
    map[FINAL_OUT_KEYS.RECIPIENT_NAME_ROLE] =
      payload.outgoing.recipientNameRole;
    map[FINAL_OUT_KEYS.RECIPIENT_INSTITUTION] =
      payload.outgoing.recipientInstitution;
    map[FINAL_OUT_KEYS.DISPATCH_EMAILS_JSON] = JSON.stringify(
      normalizeEmailsArray(payload.outgoing.dispatchEmails),
    );
    map[FINAL_OUT_KEYS.DISPATCHED_AT] = automatic.dispatchedAt;
    map[FINAL_OUT_KEYS.DISPATCH_RESPONSIBLE] = actorName;
  }

  if (payload.metadata.documentFlow === "RECEIVED") {
    map[FINAL_IN_KEYS.SENDER_NAME_ROLE] =
      payload.incoming?.senderNameRole || "";
    map[FINAL_IN_KEYS.SENDER_INSTITUTION] =
      payload.incoming?.senderInstitution || "";
    map[FINAL_IN_KEYS.RECEIVED_AT] = automatic.receivedAt;
    map[FINAL_IN_KEYS.RECEIPT_RESPONSIBLE] = actorName;
  }

  return map;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeFileName(value) {
  return String(value || "documento-ead2002.xml")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_");
}

function formatHumanSize(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function buildEadPreviewTree(preview) {
  return [
    {
      tag: "ead",
      label: "Raíz EAD 2002",
      children: [
        {
          tag: "eadheader",
          label: "Encabezado descriptivo",
          children: [
            {
              tag: "eadid",
              label: "Identificador",
              value: preview.document.officialCode || "—",
            },
            {
              tag: "filedesc",
              label: "Descripción del archivo",
            },
          ],
        },
        {
          tag: "archdesc",
          label: "Descripción archivística",
          children: [
            {
              tag: "did",
              label: "Identificación documental",
              children: [
                {
                  tag: "unittitle",
                  label: "Título",
                  value: preview.document.title || "—",
                },
                {
                  tag: "unitid",
                  label: "Código",
                  value: preview.document.officialCode || "—",
                },
                {
                  tag: "origination",
                  label: "Autor",
                  value: preview.metadata.descriptive.author || "—",
                },
              ],
            },
            {
              tag: "dsc",
              label: "Clasificación jerárquica",
              children: [
                {
                  tag: "c01",
                  label: "Serie",
                  value: preview.document.serieName || "—",
                  children: preview.document.subserieName
                    ? [
                        {
                          tag: "c02",
                          label: "Subserie",
                          value: preview.document.subserieName,
                          children: [
                            {
                              tag: "c03",
                              label: "Expediente",
                              value:
                                preview.metadata.descriptive.expediente || "—",
                            },
                          ],
                        },
                      ]
                    : [
                        {
                          tag: "c02",
                          label: "Expediente",
                          value: preview.metadata.descriptive.expediente || "—",
                        },
                      ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function buildEadXml(preview) {
  const langcode = "spa";
  const countrycode = "cr";
  const mainagencycode = "MNCR";
  const dateNow = new Date().toISOString().slice(0, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ead xmlns="urn:isbn:1-931666-22-9"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     audience="external">
  <eadheader countryencoding="iso3166-1"
             dateencoding="iso8601"
             findaidstatus="completed"
             langencoding="iso639-2b"
             repositoryencoding="iso15511">
    <eadid countrycode="${countrycode}" mainagencycode="${mainagencycode}">${xmlEscape(preview.document.officialCode || "")}</eadid>
    <filedesc>
      <titlestmt>
        <titleproper>${xmlEscape(preview.document.title || "")}</titleproper>
        <author>${xmlEscape(preview.metadata.descriptive.author || "")}</author>
      </titlestmt>
      <publicationstmt>
        <publisher>${xmlEscape(preview.metadata.management.unitResponsible || "Museo Nacional de Costa Rica")}</publisher>
        <date normal="${xmlEscape(dateNow)}">${xmlEscape(dateNow)}</date>
      </publicationstmt>
    </filedesc>
    <profiledesc>
      <langusage>
        <language langcode="${langcode}">Español</language>
      </langusage>
    </profiledesc>
  </eadheader>
  <archdesc level="file">
    <did>
      <unitid>${xmlEscape(preview.document.officialCode || "")}</unitid>
      <unittitle>${xmlEscape(preview.document.title || "")}</unittitle>
      <origination label="Autor">${xmlEscape(preview.metadata.descriptive.author || "")}</origination>
      <repository>${xmlEscape(preview.metadata.management.unitResponsible || "Museo Nacional de Costa Rica")}</repository>
      <physdesc>
        <extent>${xmlEscape(preview.metadata.technical.sizeHuman || "—")}</extent>
        <genreform>${xmlEscape(preview.metadata.technical.format || "—")}</genreform>
      </physdesc>
      <unitdate normal="${xmlEscape(String(preview.metadata.management.createdAtISO || "").slice(0, 10))}">${xmlEscape(String(preview.metadata.management.createdAtISO || "").slice(0, 10))}</unitdate>
    </did>
    <scopecontent>
      <p>Tipo documental: ${xmlEscape(preview.metadata.descriptive.documentType || "—")}</p>
      <p>Serie: ${xmlEscape(preview.metadata.descriptive.serie || "—")}</p>
      <p>Subserie: ${xmlEscape(preview.metadata.descriptive.subserie || "—")}</p>
      <p>Expediente: ${xmlEscape(preview.metadata.descriptive.expediente || "—")}</p>
    </scopecontent>
    <controlaccess>
      <subject>${xmlEscape(preview.document.state || "ARCHIVADO")}</subject>
      <subject>${xmlEscape(preview.metadata.management.retentionYears != null ? `${preview.metadata.management.retentionYears} años` : "—")}</subject>
    </controlaccess>
  </archdesc>
</ead>`;
}

export const conservationIntakeService = {
  async searchCandidates(rawFilters, actor) {
    assertConservationActor(actor);

    const filters = conservationSearchSchema.parse(rawFilters);
    const rows = await conservationIntakeRepo.searchCandidates(
      filters,
      buildConservationAccessScope(actor),
    );

    let mapped = rows.map((row) => {
      const actualPdfA =
        String(row.format || "")
          .toLowerCase()
          .includes("pdf") ||
        String(row.signedPdfCurrent || "")
          .toLowerCase()
          .endsWith(".pdf");

      const actualSignaturesComplete =
        Number(row.numero_firmas || 0) === 0 ||
        Number(row.firmas_obtenidas || 0) >= Number(row.numero_firmas || 0);

      return {
        id: row.id,
        officialCode: row.officialCode || "",
        title: row.title,
        documentType: row.documentType || null,
        producingUnit: row.producingUnit,
        createdAtISO: row.createdAtISO,
        author: row.author || "",
        accessLevel: row.accessLevel || "INTERNAL",
        isPDFA: ALLOW_ANY_DOCUMENT_FOR_CONSERVATION ? true : actualPdfA,
        signaturesComplete: ALLOW_UNSIGNED_CONSERVATION
          ? true
          : actualSignaturesComplete,
        keywords: Array.isArray(row.keywords) ? row.keywords : [],
        sizeBytes:
          row.sizeBytes != null && row.sizeBytes !== ""
            ? Number(row.sizeBytes)
            : null,
        format: row.format || null,
        signers: Array.isArray(row.signers) ? row.signers : [],
        signedAt: Array.isArray(row.signedAt) ? row.signedAt : [],
        softwareVersion: row.softwareVersion || null,
        documentFlow: row.documentFlow || null,
      };
    });

    if (filters.signatureState === "COMPLETE") {
      mapped = mapped.filter((row) => row.signaturesComplete);
    }

    if (filters.signatureState === "INCOMPLETE") {
      mapped = mapped.filter((row) => !row.signaturesComplete);
    }

    return mapped;
  },

  async checkDuplicateOfficialCode(rawQuery) {
    const { code } = duplicateCheckSchema.parse(rawQuery);

    const existing =
      await conservationIntakeRepo.findExistingIntakeByOfficialCode(code);

    if (existing) {
      return {
        status: "DUPLICATE",
        existingId: Number(existing.documentId),
      };
    }

    return { status: "OK" };
  },

  async previewReferenceCode(rawQuery, actor) {
    assertConservationActor(actor);

    const { candidateId, documentType, producingUnit } =
      referenceCodePreviewSchema.parse(rawQuery);

    const [doc, metadataMap] = await Promise.all([
      conservationIntakeRepo.findDocumentById(candidateId),
      metadatoRepo.getMap(candidateId),
    ]);

    if (!doc) {
      const error = new Error("Document not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const canManage = await canActorManageConservationDocument(actor, doc);
    if (!canManage) {
      const error = new Error(
        "No tiene permisos para gestionar este documento.",
      );
      error.code = "FORBIDDEN";
      throw error;
    }

    const resolvedDocumentType =
      String(documentType || "").trim() ||
      String(
        pickFirst(metadataMap, [
          EDIT_KEYS.DOCUMENT_TYPE,
          "DESC_PRELIM_CLASS",
        ]) || "",
      ).trim();

    if (!resolvedDocumentType) {
      const error = new Error(
        "Document type is required to generate the final reference code",
      );
      error.code = "INCOMPLETE_ARCHIVAL_METADATA";
      throw error;
    }

    const resolvedProducingUnit =
      String(producingUnit || "").trim() ||
      String(doc.producingUnitName || "").trim();

    return this._generateFinalReferenceCode({
      currentCode: doc.numero_serie,
      documentType: resolvedDocumentType,
      producingUnit: resolvedProducingUnit,
    });
  },

  async listRetentionRules() {
    return conservationIntakeRepo.listRetentionRules();
  },

  async _generateFinalReferenceCode({
    currentCode,
    documentType,
    producingUnit,
  }) {
    const year = new Date().getFullYear();
    const typeCode = buildTypeCode(documentType);
    const unitCode = buildUnitCode(producingUnit);

    const existingManaged = parseManagedReferenceCode(currentCode, {
      typeCode,
      unitCode,
      year,
    });

    if (existingManaged) {
      return {
        referenceCode: existingManaged.referenceCode,
        typeCode,
        unitCode,
        sequence: existingManaged.sequence,
        year,
      };
    }

    const highestSequence =
      await conservationIntakeRepo.findHighestReferenceSequence({
        typeCode,
        unitCode,
        year,
      });

    const nextSequence = highestSequence + 1;

    return {
      referenceCode: formatReferenceCode({
        typeCode,
        unitCode,
        sequence: nextSequence,
        year,
      }),
      typeCode,
      unitCode,
      sequence: nextSequence,
      year,
    };
  },

  async registerIntake(rawPayload, actor) {
    const payload = conservationIntakeSchema.parse(rawPayload);
    const actorId = assertConservationActor(actor);

    const [doc, docMetadataMap, signatures, actorName] = await Promise.all([
      conservationIntakeRepo.findDocumentById(payload.candidateId),
      metadatoRepo.getMap(payload.candidateId),
      conservationIntakeRepo.listDocumentSignatures(payload.candidateId),
      resolveActorName(actorId),
    ]);

    if (!doc) {
      const error = new Error("Document not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const canManage = await canActorManageConservationDocument(actor, doc);
    if (!canManage) {
      const error = new Error(
        "No tiene permisos para gestionar este documento.",
      );
      error.code = "FORBIDDEN";
      throw error;
    }

    const resolvedDocumentType =
      String(payload.metadata.documentType || "").trim() ||
      String(
        pickFirst(docMetadataMap, [
          EDIT_KEYS.DOCUMENT_TYPE,
          "DESC_PRELIM_CLASS",
        ]) || "",
      ).trim();

    const resolvedProducingUnit = String(
      payload.metadata.producingUnit || doc.producingUnitName || "",
    ).trim();

    const generatedReference = await this._generateFinalReferenceCode({
      currentCode: doc.numero_serie,
      documentType: resolvedDocumentType,
      producingUnit: resolvedProducingUnit,
    });

    const finalReferenceCode = generatedReference.referenceCode;

    if (!isOfficialCodeComplete(finalReferenceCode)) {
      const error = new Error(
        "The document does not have a complete official identifier",
      );
      error.code = "INCOMPLETE_OFFICIAL_CODE";
      throw error;
    }

    const duplicateByDocument =
      await conservationIntakeRepo.findExistingIntakeByDocumentId(
        payload.candidateId,
      );

    if (duplicateByDocument) {
      const error = new Error(
        "The document is already registered in conservation",
      );
      error.code = "DUPLICATE_CONSERVATION_DOCUMENT";
      error.status = 409;
      throw error;
    }

    const duplicateByCode =
      await conservationIntakeRepo.findExistingIntakeByOfficialCode(
        finalReferenceCode,
      );

    if (duplicateByCode) {
      await logCycleEvent({
        actorId,
        documentId: payload.candidateId,
        accion: "CONSERVACION_INGRESO",
        resultado: "DENEGADO",
        detail: {
          accion_solicitada: "CONSERVACION_INICIO",
          motivo: "Código oficial ya existe en conservación",
          duplicateDocumentId: duplicateByCode.documentId,
          officialCode: finalReferenceCode,
        },
      });

      const error = new Error("Official code already exists in conservation");
      error.code = "DUPLICATE_OFFICIAL_CODE";
      error.status = 409;
      error.extra = { existingId: Number(duplicateByCode.documentId) };
      throw error;
    }

    const [serie, subserie, expediente] = await Promise.all([
      conservationIntakeRepo.findSerieById(payload.classification.serieId),
      payload.classification.subserieId != null
        ? conservationIntakeRepo.findSubserieById(
            payload.classification.subserieId,
          )
        : Promise.resolve(null),
      conservationIntakeRepo.findExpedienteById(
        payload.classification.expedienteId,
      ),
    ]);

    if (!serie || Number(serie.activa) !== 1) {
      const error = new Error("Invalid archival structure: serie not found");
      error.code = "INVALID_ARCHIVAL_STRUCTURE";
      throw error;
    }

    if (payload.classification.subserieId != null) {
      if (!subserie || Number(subserie.activa) !== 1) {
        const error = new Error(
          "Invalid archival structure: subserie not found",
        );
        error.code = "INVALID_ARCHIVAL_STRUCTURE";
        throw error;
      }

      if (Number(subserie.serie_id) !== Number(serie.id)) {
        const error = new Error(
          "Invalid archival structure: subserie does not belong to serie",
        );
        error.code = "INVALID_ARCHIVAL_STRUCTURE";
        throw error;
      }
    }

    if (!expediente) {
      const error = new Error(
        "Invalid archival structure: expediente not found",
      );
      error.code = "INVALID_ARCHIVAL_STRUCTURE";
      throw error;
    }

    if (
      hasEditorRole(actor) &&
      !hasArchivistRole(actor) &&
      !hasAdminRole(actor)
    ) {
      const actorUnitId = getActorUnitId(actor);
      const documentUnitId = Number(doc.unidad_id || 0);
      const expedienteUnitId = Number(expediente?.unidad_id || 0);
      const serieUnitId = Number(serie?.unidad_id || 0);

      if (
        !actorUnitId ||
        documentUnitId !== actorUnitId ||
        (expedienteUnitId > 0 && expedienteUnitId !== actorUnitId) ||
        (serieUnitId > 0 && serieUnitId !== actorUnitId)
      ) {
        const error = new Error(
          "El Editor solo puede gestionar documentos y clasificación de su propia unidad.",
        );
        error.code = "FORBIDDEN";
        throw error;
      }
    }

    if (Number(expediente.serie_id) !== Number(serie.id)) {
      const error = new Error(
        "Invalid archival structure: expediente does not belong to serie",
      );
      error.code = "INVALID_ARCHIVAL_STRUCTURE";
      throw error;
    }

    if (
      payload.classification.subserieId != null &&
      Number(expediente.subserie_id || 0) !==
        Number(payload.classification.subserieId)
    ) {
      const error = new Error(
        "Invalid archival structure: expediente does not belong to subserie",
      );
      error.code = "INVALID_ARCHIVAL_STRUCTURE";
      throw error;
    }

    if (
      serie.plazo_conservacion_anios == null ||
      Number(serie.plazo_conservacion_anios) <= 0
    ) {
      const error = new Error("Invalid retention configuration in serie");
      error.code = "INVALID_RETENTION_RULE";
      throw error;
    }

    const latestDocumentDate =
      await conservationIntakeRepo.findLatestDocumentDateByExpediente(
        payload.classification.expedienteId,
      );

    const retentionStartDate = latestDocumentDate
      ? new Date(latestDocumentDate).toISOString().slice(0, 10)
      : new Date(doc.fecha).toISOString().slice(0, 10);

    const retentionRule = {
      id: null,
      label: `Serie: ${serie.nombre}`,
      years: Number(serie.plazo_conservacion_anios),
      activa: 1,
    };

    const resolvedKeywords = normalizeKeywordsArray(payload.metadata.keywords);
    const resolvedSizeBytes =
      toNullableNumber(payload.metadata.sizeBytes) ??
      toNullableNumber(
        pickFirst(docMetadataMap, [EDIT_KEYS.SIZE, LEGACY_KEYS.SIZE]),
      );

    const resolvedFormat =
      String(payload.metadata.format || "").trim() ||
      String(
        pickFirst(docMetadataMap, [LEGACY_KEYS.MIME, LEGACY_KEYS.EXT]) || "",
      ).trim() ||
      null;

    const resolvedSoftwareVersion =
      String(payload.metadata.softwareVersion || "").trim() ||
      String(
        pickFirst(docMetadataMap, [EDIT_KEYS.SOFTWARE, LEGACY_KEYS.SOFTWARE]) ||
          "",
      ).trim() ||
      null;

    const resolvedSigners =
      normalizeStringArray(payload.metadata.signers).length > 0
        ? normalizeStringArray(payload.metadata.signers)
        : signatures.map((item) => item.signerName).filter(Boolean);

    const resolvedSignedAt =
      normalizeStringArray(payload.metadata.signedAt).length > 0
        ? normalizeStringArray(payload.metadata.signedAt)
        : signatures.map((item) => item.signedAtISO).filter(Boolean);

    const metadataIncomplete =
      !payload.metadata.title?.trim() ||
      !resolvedDocumentType ||
      !resolvedProducingUnit ||
      !payload.metadata.accessLevel ||
      resolvedSizeBytes == null ||
      !resolvedFormat ||
      (!ALLOW_UNSIGNED_CONSERVATION &&
        (resolvedSigners.length === 0 || resolvedSignedAt.length === 0));

    if (metadataIncomplete) {
      const error = new Error("Archival metadata is incomplete");
      error.code = "INCOMPLETE_ARCHIVAL_METADATA";
      throw error;
    }

    const retentionEndDate = addYearsToDate(
      retentionStartDate,
      retentionRule.years,
    );

    const estadoConservacion = calcularEstadoConservacion(retentionEndDate);

    const classificationCode = String(payload.classification.code || "").trim();
    const classificationLabel = buildFinalClassificationLabel({
      serie,
      subserie,
      expediente,
      fallback: payload.classification.label,
    });

    const automatic = {
      creatorName: doc.authorName || "DESCONOCIDO",
      sizeBytes: resolvedSizeBytes,
      format: resolvedFormat,
      signers: resolvedSigners,
      signedAt: resolvedSignedAt,
      softwareVersion: resolvedSoftwareVersion,
      dispatchedAt:
        payload.metadata.documentFlow === "PRODUCED_SENT"
          ? new Date().toISOString()
          : null,
      receivedAt:
        payload.metadata.documentFlow === "RECEIVED"
          ? new Date().toISOString()
          : null,
    };

    const payloadSnapshot = {
      ...payload,
      officialCode: finalReferenceCode,
      metadata: {
        ...payload.metadata,
        documentType: resolvedDocumentType,
        producingUnit: resolvedProducingUnit,
        keywords: resolvedKeywords,
        sizeBytes: resolvedSizeBytes,
        format: resolvedFormat,
        signers: resolvedSigners,
        signedAt: resolvedSignedAt,
        softwareVersion: resolvedSoftwareVersion,
      },
      classification: {
        ...payload.classification,
        code: classificationCode,
        label: classificationLabel,
      },
      retention: {
        ...payload.retention,
        startDateISO: retentionStartDate,
        endDateISO: retentionEndDate,
        years: retentionRule.years,
        label: retentionRule.label,
        ruleId: retentionRule.id,
      },
      automatic: {
        ...automatic,
        dispatchResponsible:
          payload.metadata.documentFlow === "PRODUCED_SENT" ? actorName : null,
        receiptResponsible:
          payload.metadata.documentFlow === "RECEIVED" ? actorName : null,
      },
    };

    const metadataMap = buildArchivalMetadataMap({
      payload: {
        ...payload,
        retention: {
          ...payload.retention,
          startDateISO: retentionStartDate,
          ruleId: retentionRule.id,
        },
        metadata: {
          ...payload.metadata,
          documentType: resolvedDocumentType,
          producingUnit: resolvedProducingUnit,
          keywords: resolvedKeywords,
          sizeBytes: resolvedSizeBytes,
          format: resolvedFormat,
          signers: resolvedSigners,
          signedAt: resolvedSignedAt,
          softwareVersion: resolvedSoftwareVersion,
        },
        classification: {
          ...payload.classification,
          code: classificationCode,
          label: classificationLabel,
        },
      },
      retentionRule,
      retentionEndDate,
      actorId,
      actorName,
      automatic,
      referenceCode: finalReferenceCode,
    });

    const result = await conservationIntakeRepo.withTransaction(
      async (conn) => {
        await conservationIntakeRepo.upsertClassificationCatalogTx(conn, {
          classificationCode,
          classificationLabel,
        });

        await conservationIntakeRepo.updateDocumentForConservationTx(conn, {
          documentId: payload.candidateId,
          expedienteId: payload.classification.expedienteId,
          referenceCode: finalReferenceCode,
          title: payload.metadata.title.trim(),
          accessLevel: payload.metadata.accessLevel,
        });

        await conservationIntakeRepo.updateDocumentConservationTermTx(conn, {
          documentId: payload.candidateId,
          retentionYears: retentionRule.years,
          retentionStartDate,
          retentionEndDate,
          estadoConservacion,
        });

        await conservationIntakeRepo.upsertMetadataMapTx(
          conn,
          payload.candidateId,
          metadataMap,
        );

        return conservationIntakeRepo.insertIntakeTx(conn, {
          documentId: payload.candidateId,
          officialCode: finalReferenceCode,
          classificationCode,
          classificationLabel,
          accessLevel: payload.metadata.accessLevel,
          retentionRuleId: retentionRule.id,
          retentionYears: retentionRule.years,
          retentionStartDate,
          retentionEndDate,
          trackingEnabled: payload.retention.trackingEnabled,
          payloadSnapshot,
          createdBy: actorId,
        });
      },
    );

    await logCycleEvent({
      actorId,
      documentId: payload.candidateId,
      accion: "CONSERVACION_INGRESO",
      resultado: "PERMITIDO",
      detail: {
        accion_solicitada: "CONSERVACION_INICIO",
        motivo: "Ingreso a conservación",
        intakeId: result.id,
        officialCode: finalReferenceCode,
        classificationCode,
        retentionRuleId: retentionRule.id,
        retentionStartDate,
        retentionEndDate,
        trackingEnabled: payload.retention.trackingEnabled,
        documentFlow: payload.metadata.documentFlow,
        expedienteId: payload.classification.expedienteId,
      },
    });

    const expId = Number(payload.classification?.expedienteId);
    if (Number.isFinite(expId) && expId > 0) {
      await insertBitacoraExpedienteSafe({
        expediente_id: expId,
        usuario_id: resolveBitacoraUsuarioId(actorId),
        evento: "DOCUMENTO_VINCULADO",
        resultado: "PERMITIDO",
        detalle: {
          documento_id: payload.candidateId,
          officialCode: finalReferenceCode,
          origen: "conservacion_ingreso",
          intakeId: result.id,
        },
      });
    }

    await notificacionRepo.createNotificacion({
      fecha: new Date(),
      tipo: "PLAZO_ASIGNADO",
      accion_requerida: "EDITAR",
      fecha_limite: retentionEndDate,
      enlace_directo: `http://localhost:4200/archivista/gestion-plazos`,
      resultado: `Plazo asignado para el documento: ${payload.metadata.title}`,
      usuario_id: actorId,
      documento_id: payload.candidateId,
    });

    return {
      intakeId: `INTAKE-${result.id}`,
      id: result.id,
      message: "Document successfully registered in conservation",
      officialCode: finalReferenceCode,
    };
  },

  async audit(rawPayload, actor) {
    const payload = conservationAuditSchema.parse(rawPayload);
    const actorId = getActorId(actor);

    if (!actorId) {
      const error = new Error("Unauthorized");
      error.code = "UNAUTHORIZED";
      throw error;
    }

    await logUiActivity({
      actorId,
      action: `HU019_${payload.event}`.toUpperCase(),
      detail: payload.detail ?? {},
    });

    return { ok: true };
  },

  async listEadDocuments(actor) {
    assertConservationActor(actor);

    return conservationIntakeRepo.listEadDocuments(
      buildConservationAccessScope(actor),
    );
  },

  async previewEadExport(documentId, actor) {
    const actorId = assertConservationActor(actor);

    const [doc, metadataMap] = await Promise.all([
      conservationIntakeRepo.findEadDocumentById(documentId),
      metadatoRepo.getMap(documentId),
    ]);

    if (!doc) {
      const error = new Error("Document not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const canManage = await canActorManageConservationDocument(actor, doc);
    if (!canManage) {
      const error = new Error(
        "You do not have permission to export this document to EAD 2002",
      );
      error.code = "FORBIDDEN";
      throw error;
    }

    if (String(doc.state || "").toUpperCase() !== "ARCHIVADO") {
      const error = new Error(
        "Only archived conservation documents can be exported to EAD 2002",
      );
      error.code = "INVALID_DOCUMENT_STATE";
      throw error;
    }

    const descriptiveTitle =
      pickFirst(metadataMap, [FINAL_KEYS.TITLE, LEGACY_KEYS.TITLE]) ||
      doc.title;

    const descriptiveAuthor =
      pickFirst(metadataMap, [LEGACY_KEYS.AUTHOR]) || doc.authorName || "—";

    const descriptiveType =
      pickFirst(metadataMap, [
        FINAL_KEYS.DOCUMENT_TYPE,
        EDIT_KEYS.DOCUMENT_TYPE,
      ]) || "—";

    const technicalFormat =
      pickFirst(metadataMap, [
        FINAL_KEYS.FORMAT,
        LEGACY_KEYS.MIME,
        LEGACY_KEYS.EXT,
      ]) || "—";

    const technicalSizeBytes = toNullableNumber(
      pickFirst(metadataMap, [FINAL_KEYS.SIZE_BYTES, LEGACY_KEYS.SIZE]),
    );

    const managementRetentionYears = toNullableNumber(
      pickFirst(metadataMap, [
        FINAL_KEYS.RETENTION_YEARS,
        "ARCH_RETENTION_YEARS",
      ]),
    );

    const validations = [
      {
        key: "document_exists",
        label: "Documento existente",
        valid: !!doc.id,
      },
      {
        key: "document_archived",
        label: "Documento en estado archivado",
        valid: String(doc.state || "").toUpperCase() === "ARCHIVADO",
      },
      {
        key: "conservation_record",
        label: "Ingreso a conservación registrado",
        valid: !!doc.intakeId,
      },
      {
        key: "archival_hierarchy",
        label: "Serie / expediente archivístico asociado",
        valid: !!doc.serieId && !!doc.expedienteId,
      },
      {
        key: "descriptive_metadata",
        label: "Metadatos descriptivos completos",
        valid: !!descriptiveTitle && !!descriptiveType,
      },
      {
        key: "technical_metadata",
        label: "Metadatos técnicos disponibles",
        valid: !!technicalFormat && technicalSizeBytes != null,
      },
    ];

    const canExport = validations.every((item) => item.valid);

    const preview = {
      document: {
        id: Number(doc.id),
        officialCode: doc.officialCode || doc.intakeOfficialCode || "",
        state: doc.state || "ARCHIVADO",
        title: descriptiveTitle || "",
        serieName: doc.serieName || null,
        subserieName: doc.subserieName || null,
      },
      validations,
      metadata: {
        descriptive: {
          title: descriptiveTitle || "—",
          author: descriptiveAuthor || "—",
          documentType: descriptiveType || "—",
          serie: doc.serieName || "—",
          subserie: doc.subserieName || "—",
          expediente:
            [doc.expedienteCode, doc.expedienteName]
              .filter(Boolean)
              .join(" · ") || "—",
        },
        technical: {
          format: technicalFormat || "—",
          sizeBytes: technicalSizeBytes,
          sizeHuman: formatHumanSize(technicalSizeBytes),
          code: doc.officialCode || doc.intakeOfficialCode || "—",
        },
        management: {
          state: doc.state || "ARCHIVADO",
          createdAtISO: doc.createdAtISO
            ? new Date(doc.createdAtISO).toISOString()
            : null,
          retentionYears: managementRetentionYears,
          unitResponsible: doc.unitName || "Museo Nacional de Costa Rica",
        },
      },
      canExport,
    };

    const previewTree = buildEadPreviewTree(preview);
    const xmlPreview = buildEadXml(preview);
    const fileName = sanitizeFileName(
      `${preview.document.officialCode || "documento"}-ead2002.xml`,
    );

    return {
      ...preview,
      previewTree,
      xmlPreview,
      fileName,
    };
  },

  async exportEadXml(documentId, actor) {
    const actorId = assertConservationActor(actor);

    const preview = await this.previewEadExport(documentId, actor);

    if (!preview.canExport) {
      const error = new Error(
        "The document does not meet all requirements for EAD 2002 export",
      );
      error.code = "EAD_EXPORT_NOT_ALLOWED";
      throw error;
    }

    const fileName = preview.fileName;
    const xml = preview.xmlPreview;

    await conservationIntakeRepo.withTransaction(async (conn) => {
      await conservationIntakeRepo.upsertMetadataMapTx(conn, documentId, {
        [EAD_KEYS.LAST_EXPORTED_AT]: new Date().toISOString(),
        [EAD_KEYS.LAST_EXPORTED_BY]: String(actorId),
        [EAD_KEYS.LAST_FILE_NAME]: fileName,
      });
    });

    await logCycleEvent({
      actorId,
      documentId,
      accion: "CONSERVACION_EXPORTACION_EAD2002",
      resultado: "PERMITIDO",
      detail: {
        accion_solicitada: "EXPORTAR_EAD_2002",
        motivo: "Exportación XML EAD 2002",
        fileName,
        officialCode: preview.document.officialCode,
      },
    });

    if (Number(preview?.document?.id) > 0) {
      const docRow =
        await conservationIntakeRepo.findEadDocumentById(documentId);
      const expId = Number(docRow?.expedienteId || 0);

      if (expId > 0) {
        await insertBitacoraExpedienteSafe({
          expediente_id: expId,
          usuario_id: resolveBitacoraUsuarioId(actorId),
          evento: "DESCARGA",
          resultado: "PERMITIDO",
          detalle: {
            documento_id: Number(documentId),
            formato: "EAD2002_XML",
            fileName,
            origen: "exportacion_ead_2002",
          },
        });
      }
    }

    return {
      fileName,
      xml,
    };
  },
};

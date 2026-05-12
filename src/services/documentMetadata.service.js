import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { userRepo } from "../repositories/userRepo.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { sha256Hex } from "../utils/hash.js";
import {
  descriptiveMetadataSchema,
  normalizeKeywords,
} from "../utils/metadataSchemas.js";
import { pool } from "../db/pool.js";

/**
 * Legacy technical metadata keys kept for backward compatibility.
 * These keys are still written so existing code paths do not break.
 */
const LEGACY_TECH_KEYS = {
  MIME: "TECH_MIME_TYPE",
  EXT: "TECH_FILE_EXT",
  SIZE: "TECH_SIZE_BYTES",
  CREATED_AT: "TECH_CREATED_SRC_AT",
  UPDATED_AT: "TECH_UPDATED_SRC_AT",
  HASH: "TECH_CONTENT_HASH",
  STORAGE_URI: "TECH_STORAGE_URI",
  ACCESS_LEVEL: "TECH_ACCESS_LEVEL",
  SOFTWARE: "TECH_SOFTWARE",
  DOC_CODE: "TECH_DOCUMENT_CODE",
};

/**
 * Legacy descriptive metadata keys kept for backward compatibility.
 * Some old flows still read these values.
 */
const LEGACY_DESC_KEYS = {
  TITLE: "DESC_TITLE",
  AUTHOR: "DESC_AUTHOR",
  UNIT_ID: "DESC_RESPONSIBLE_UNIT_ID",
  KEYWORDS: "DESC_KEYWORDS_JSON",
  PRELIM_CLASS: "DESC_PRELIM_CLASS",
  CLASS_CODE: "DESC_CLASSIFICATION_CODE",
};

/**
 * New automatic metadata keys for the edition stage.
 */
export const AUTO_KEYS = {
  IDENTIFIER: "EDIT_AUTO_IDENTIFIER",
  SIZE: "EDIT_AUTO_SIZE_BYTES",
  PRODUCER_UNIT_ID: "EDIT_AUTO_PRODUCER_UNIT_ID",
  CREATION_RESPONSIBLE: "EDIT_AUTO_CREATION_RESPONSIBLE",
  CREATED_AT: "EDIT_AUTO_CREATED_AT",
  MODIFICATION_RESPONSIBLE: "EDIT_AUTO_MODIFICATION_RESPONSIBLE",
  MODIFIED_AT: "EDIT_AUTO_MODIFIED_AT",
  APPROVAL_RESPONSIBLE: "EDIT_AUTO_APPROVAL_RESPONSIBLE",
  APPROVED_AT: "EDIT_AUTO_APPROVED_AT",
  SOFTWARE: "EDIT_AUTO_SOFTWARE_VERSION",
};

/**
 * New manual metadata keys for the edition stage.
 * Producer unit is intentionally NOT here because it is automatic now.
 */
export const MANUAL_KEYS = {
  DOCUMENT_TYPE: "EDIT_MANUAL_DOCUMENT_TYPE",
  TITLE: "EDIT_MANUAL_TITLE",
  KEYWORDS: "EDIT_MANUAL_KEYWORDS_JSON",
  ACCESS_LEVEL: "EDIT_MANUAL_ACCESS_LEVEL",
};

/**
 * Returns current time in ISO 8601 format.
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Returns the first non-empty value found in the given metadata map.
 */
function pickFirst(map, keys) {
  for (const key of keys) {
    const value = map?.[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

/**
 * Safely parses a JSON array string.
 * Returns an empty array if parsing fails or the parsed value is not an array.
 */
function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Safely converts a value to a positive integer or null.
 */
function toPositiveIntOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Resolves the unit name from Unidad_Organizacional.
 */
async function resolveUnitName(unitId) {
  if (!unitId) return null;

  const [rows] = await pool.query(
    `SELECT nombre FROM Unidad_Organizacional WHERE id = ?`,
    [unitId],
  );

  return rows[0]?.nombre ?? null;
}

/**
 * Resolves a user's full name.
 */
async function resolveUserFullName(userId) {
  if (!userId) return null;

  const u = await userRepo.findById(userId);
  if (!u) return null;

  return [u.nombre, u.apellido1, u.apellido2].filter(Boolean).join(" ").trim();
}

/**
 * Resolves approval metadata from the audit log if explicit approval metadata
 * was not yet persisted in Metadato.
 */
async function resolveApprovalFallback(documento_id) {
  const [rows] = await pool.query(
    `
      SELECT b.usuario_id, b.fecha
      FROM Bitacora_Base b
      JOIN Bitacora_Ciclo_Documental c ON c.id = b.id
      WHERE b.documento_id = ?
        AND b.accion = 'PREPARAR_FIRMA'
      ORDER BY b.fecha DESC, b.id DESC
      LIMIT 1
    `,
    [documento_id],
  );

  const row = rows[0];
  if (!row) {
    return {
      approvalResponsible: null,
      approvedAt: null,
    };
  }

  return {
    approvalResponsible: await resolveUserFullName(row.usuario_id),
    approvedAt: row.fecha ? new Date(row.fecha).toISOString() : null,
  };
}

/**
 * Resolves the automatic producer unit.
 *
 * Priority:
 * 1. Documento.unidad_id
 * 2. current actor unit
 * 3. already stored automatic unit metadata
 * 4. legacy stored responsible unit metadata
 */
function resolveAutomaticProducerUnitId({ doc, actor, currentMap }) {
  return (
    toPositiveIntOrNull(doc?.unidad_id) ||
    toPositiveIntOrNull(actor?.unidad_id) ||
    toPositiveIntOrNull(actor?.unidadId) ||
    toPositiveIntOrNull(currentMap?.[AUTO_KEYS.PRODUCER_UNIT_ID]) ||
    toPositiveIntOrNull(currentMap?.[LEGACY_DESC_KEYS.UNIT_ID]) ||
    null
  );
}

export const documentMetadataService = {
  /**
   * Captures automatic/technical metadata.
   *
   * Important behavior:
   * - If content is provided, size/hash are recalculated.
   * - If content is NOT provided, previous size/hash are preserved.
   * - Producer unit is automatic.
   * - Identifier comes from Documento.numero_serie when available.
   * - Legacy keys are also written for compatibility.
   */
  async captureTechnical({
    documento_id,
    mimeType,
    fileExt,
    content,
    storageUri,
    actorId = null,
    software = process.env.APP_SOFTWARE_VERSION || "Patrimonius v1.0",
  }) {
    const [current, doc, actor] = await Promise.all([
      metadatoRepo.getMap(documento_id),
      documentoRepo.findById(documento_id),
      actorId ? userRepo.findById(actorId) : Promise.resolve(null),
    ]);

    const hasContent = content != null;
    const sizeBytes = hasContent
      ? Buffer.byteLength(String(content), "utf8")
      : Number(
          pickFirst(current, [AUTO_KEYS.SIZE, LEGACY_TECH_KEYS.SIZE]) ?? 0,
        );

    const hash = hasContent
      ? sha256Hex(String(content))
      : pickFirst(current, [LEGACY_TECH_KEYS.HASH]);

    const creatorName =
      pickFirst(current, [
        AUTO_KEYS.CREATION_RESPONSIBLE,
        LEGACY_DESC_KEYS.AUTHOR,
      ]) || (await resolveUserFullName(doc?.usuario_id));

    const modifierName =
      (await resolveUserFullName(actorId)) ||
      pickFirst(current, [AUTO_KEYS.MODIFICATION_RESPONSIBLE]) ||
      creatorName;

    const createdAt =
      pickFirst(current, [AUTO_KEYS.CREATED_AT, LEGACY_TECH_KEYS.CREATED_AT]) ||
      (doc?.fecha ? new Date(doc.fecha).toISOString() : nowIso());

    const updatedAt = nowIso();

    const identifier =
      doc?.numero_serie ||
      pickFirst(current, [AUTO_KEYS.IDENTIFIER, LEGACY_TECH_KEYS.DOC_CODE]) ||
      "";

    const producerUnitId = resolveAutomaticProducerUnitId({
      doc,
      actor,
      currentMap: current,
    });

    const accessLevel =
      doc?.confid_level ||
      pickFirst(current, [
        MANUAL_KEYS.ACCESS_LEVEL,
        LEGACY_TECH_KEYS.ACCESS_LEVEL,
      ]) ||
      "PUBLIC";

    const map = {
      [AUTO_KEYS.IDENTIFIER]: identifier,
      [AUTO_KEYS.SIZE]: String(sizeBytes),
      [AUTO_KEYS.PRODUCER_UNIT_ID]:
        producerUnitId != null ? String(producerUnitId) : "",
      [AUTO_KEYS.CREATION_RESPONSIBLE]: creatorName || "DESCONOCIDO",
      [AUTO_KEYS.CREATED_AT]: createdAt,
      [AUTO_KEYS.MODIFICATION_RESPONSIBLE]:
        modifierName || creatorName || "DESCONOCIDO",
      [AUTO_KEYS.MODIFIED_AT]: updatedAt,
      [AUTO_KEYS.SOFTWARE]: software,

      // Legacy write-through for compatibility
      [LEGACY_TECH_KEYS.MIME]:
        mimeType || current[LEGACY_TECH_KEYS.MIME] || "text/html",
      [LEGACY_TECH_KEYS.EXT]:
        fileExt || current[LEGACY_TECH_KEYS.EXT] || "html",
      [LEGACY_TECH_KEYS.SIZE]: String(sizeBytes),
      [LEGACY_TECH_KEYS.CREATED_AT]: createdAt,
      [LEGACY_TECH_KEYS.UPDATED_AT]: updatedAt,
      [LEGACY_TECH_KEYS.HASH]: hash ?? current[LEGACY_TECH_KEYS.HASH] ?? "",
      [LEGACY_TECH_KEYS.STORAGE_URI]:
        storageUri ?? current[LEGACY_TECH_KEYS.STORAGE_URI] ?? "",
      [LEGACY_TECH_KEYS.ACCESS_LEVEL]: accessLevel,
      [LEGACY_TECH_KEYS.SOFTWARE]: software,
      [LEGACY_TECH_KEYS.DOC_CODE]: identifier,

      // Legacy descriptive compatibility
      [LEGACY_DESC_KEYS.AUTHOR]: creatorName || "DESCONOCIDO",
      [LEGACY_DESC_KEYS.UNIT_ID]:
        producerUnitId != null ? String(producerUnitId) : "",
    };

    await metadatoRepo.upsertMap(documento_id, map);

    if (hasContent && hash) {
      await documentoRepo.update(documento_id, { contenido_hash: hash });
    }

    return map;
  },

  /**
   * Persists approval metadata when the document is prepared for signature.
   * This should be called from the existing approval/signature preparation flow.
   */
  async markApproved({ documento_id, actorId }) {
    const doc = await documentoRepo.findById(documento_id);
    const approvalResponsible =
      (await resolveUserFullName(actorId)) || "DESCONOCIDO";
    const approvedAt = nowIso();
    const identifier = doc?.numero_serie || "";

    await metadatoRepo.upsertMap(documento_id, {
      [AUTO_KEYS.APPROVAL_RESPONSIBLE]: approvalResponsible,
      [AUTO_KEYS.APPROVED_AT]: approvedAt,
      [AUTO_KEYS.IDENTIFIER]: identifier,
      [LEGACY_TECH_KEYS.DOC_CODE]: identifier,
    });

    return { approvalResponsible, approvedAt };
  },

  /**
   * Returns the combined metadata structure expected by the edition UI.
   *
   * automatic:
   * - identifier
   * - sizeBytes
   * - producerUnitName
   * - responsible names and timestamps
   * - software application/version
   *
   * manual:
   * - documentType
   * - title
   * - keywords
   * - accessLevel
   */
  async readCombined(documento_id) {
    const [map, doc] = await Promise.all([
      metadatoRepo.getMap(documento_id),
      documentoRepo.findById(documento_id),
    ]);

    const producerUnitId =
      toPositiveIntOrNull(
        pickFirst(map, [AUTO_KEYS.PRODUCER_UNIT_ID, LEGACY_DESC_KEYS.UNIT_ID]),
      ) || toPositiveIntOrNull(doc?.unidad_id);

    const producerUnitName = await resolveUnitName(producerUnitId);

    let approvalResponsible = pickFirst(map, [AUTO_KEYS.APPROVAL_RESPONSIBLE]);
    let approvedAt = pickFirst(map, [AUTO_KEYS.APPROVED_AT]);

    if (!approvalResponsible || !approvedAt) {
      const fallback = await resolveApprovalFallback(documento_id);
      approvalResponsible = approvalResponsible || fallback.approvalResponsible;
      approvedAt = approvedAt || fallback.approvedAt;
    }

    const creationResponsible =
      pickFirst(map, [
        AUTO_KEYS.CREATION_RESPONSIBLE,
        LEGACY_DESC_KEYS.AUTHOR,
      ]) || (await resolveUserFullName(doc?.usuario_id));

    const modificationResponsible =
      pickFirst(map, [AUTO_KEYS.MODIFICATION_RESPONSIBLE]) ||
      creationResponsible;

    const createdAt =
      pickFirst(map, [AUTO_KEYS.CREATED_AT, LEGACY_TECH_KEYS.CREATED_AT]) ||
      (doc?.fecha ? new Date(doc.fecha).toISOString() : null);

    const modifiedAt =
      pickFirst(map, [AUTO_KEYS.MODIFIED_AT, LEGACY_TECH_KEYS.UPDATED_AT]) ||
      createdAt;

    const identifier =
      doc?.numero_serie ||
      pickFirst(map, [AUTO_KEYS.IDENTIFIER, LEGACY_TECH_KEYS.DOC_CODE]) ||
      null;

    const sizeBytesRaw = pickFirst(map, [
      AUTO_KEYS.SIZE,
      LEGACY_TECH_KEYS.SIZE,
    ]);
    const sizeBytes = sizeBytesRaw != null ? Number(sizeBytesRaw) : null;

    const softwareApplication =
      pickFirst(map, [AUTO_KEYS.SOFTWARE, LEGACY_TECH_KEYS.SOFTWARE]) || null;

    const title =
      pickFirst(map, [MANUAL_KEYS.TITLE, LEGACY_DESC_KEYS.TITLE]) ||
      doc?.titulo ||
      null;

    const documentType =
      pickFirst(map, [
        MANUAL_KEYS.DOCUMENT_TYPE,
        LEGACY_DESC_KEYS.PRELIM_CLASS,
      ]) || null;

    const keywords = parseJsonArray(
      pickFirst(map, [MANUAL_KEYS.KEYWORDS, LEGACY_DESC_KEYS.KEYWORDS]),
    );

    const accessLevel =
      doc?.confid_level ||
      pickFirst(map, [
        MANUAL_KEYS.ACCESS_LEVEL,
        LEGACY_TECH_KEYS.ACCESS_LEVEL,
      ]) ||
      null;

    return {
      automatic: {
        identifier,
        sizeBytes,
        producerUnitId,
        producerUnitName,
        creationResponsible,
        createdAt,
        modificationResponsible,
        modifiedAt,
        approvalResponsible,
        approvedAt,
        softwareApplication,
      },
      manual: {
        documentType,
        title,
        keywords,
        accessLevel,
      },
    };
  },

  /**
   * Persists manual metadata for the edition stage.
   *
   * Producer unit is automatic and resolved from:
   * - Documento.unidad_id
   * - actor unit as fallback
   *
   * Manual fields:
   * - documentType
   * - title
   * - keywords (optional)
   * - accessLevel
   */
  async setDescriptive({ documento_id, input, actorId }) {
    const parsed = descriptiveMetadataSchema.parse(input);

    const [doc, actor] = await Promise.all([
      documentoRepo.findById(documento_id),
      userRepo.findById(actorId),
    ]);

    if (!doc) {
      const e = new Error("Document not found");
      e.code = "NOT_FOUND";
      throw e;
    }

    const producerUnitId = resolveAutomaticProducerUnitId({
      doc,
      actor,
      currentMap: null,
    });

    if (!producerUnitId) {
      const e = new Error(
        "No se pudo determinar automáticamente la unidad productora. Verifique su usuario o unidad asignada.",
      );
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }

    const keywordsArr = normalizeKeywords(parsed.keywords);

    const map = {
      [MANUAL_KEYS.DOCUMENT_TYPE]: parsed.documentType,
      [MANUAL_KEYS.TITLE]: parsed.title,
      [MANUAL_KEYS.KEYWORDS]: JSON.stringify(keywordsArr),
      [MANUAL_KEYS.ACCESS_LEVEL]: parsed.accessLevel,

      [AUTO_KEYS.PRODUCER_UNIT_ID]: String(producerUnitId),

      [LEGACY_DESC_KEYS.TITLE]: parsed.title,
      [LEGACY_DESC_KEYS.KEYWORDS]: JSON.stringify(keywordsArr),
      [LEGACY_DESC_KEYS.PRELIM_CLASS]: parsed.documentType,
      [LEGACY_DESC_KEYS.UNIT_ID]: String(producerUnitId),
      [LEGACY_TECH_KEYS.ACCESS_LEVEL]: parsed.accessLevel,
    };

    await metadatoRepo.upsertMap(documento_id, map);

    await documentoRepo.update(documento_id, {
      titulo: parsed.title,
      confid_level: parsed.accessLevel,
    });

    return { ok: true };
  },

  /**
   * Validates that all required edition metadata exists before the document
   * can move to the signature preparation flow.
   *
   * Required:
   * - documentType (manual)
   * - producerUnit (automatic)
   * - title (manual)
   * - accessLevel (manual)
   *
   * Optional:
   * - keywords
   */
  async ensureDescriptiveComplete(documento_id) {
    const [map, doc] = await Promise.all([
      metadatoRepo.getMap(documento_id),
      documentoRepo.findById(documento_id),
    ]);

    const missing = [];

    if (
      !pickFirst(map, [
        MANUAL_KEYS.DOCUMENT_TYPE,
        LEGACY_DESC_KEYS.PRELIM_CLASS,
      ])
    ) {
      missing.push("documentType");
    }

    const producerUnitId =
      toPositiveIntOrNull(
        pickFirst(map, [AUTO_KEYS.PRODUCER_UNIT_ID, LEGACY_DESC_KEYS.UNIT_ID]),
      ) || toPositiveIntOrNull(doc?.unidad_id);

    if (!producerUnitId) {
      missing.push("producerUnit");
    }

    if (!pickFirst(map, [MANUAL_KEYS.TITLE, LEGACY_DESC_KEYS.TITLE])) {
      missing.push("title");
    }

    if (
      !pickFirst(map, [MANUAL_KEYS.ACCESS_LEVEL, LEGACY_TECH_KEYS.ACCESS_LEVEL])
    ) {
      missing.push("accessLevel");
    }

    if (missing.length) {
      const METADATA_FIELD_LABELS_ES = {
        documentType: "tipo documental",
        producerUnit: "unidad productora",
        title: "título",
        accessLevel: "nivel de acceso / confidencialidad",
      };
      const campos = missing
        .map((k) => METADATA_FIELD_LABELS_ES[k] || k)
        .join(", ");
      const e = new Error(
        `Faltan datos obligatorios en metadatos: ${campos}. Abra «Metadatos», complételos y guarde antes de continuar.`,
      );
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }
  },
};

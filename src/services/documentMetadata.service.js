// src/services/documentMetadata.service.js
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { bitacoraRepo, logAdminAction } from "../repositories/bitacoraRepo.js";
import { sha256Hex } from "../utils/hash.js";
import {
  descriptiveMetadataSchema,
  normalizeKeywords,
} from "../utils/metadataSchemas.js";
import { userRepo } from "../repositories/userRepo.js";

/** Metadata keys used for HU-011 (technical) and HU-012 (descriptive). */
export const TECH_KEYS = {
  MIME: "TECH_MIME_TYPE",
  EXT: "TECH_FILE_EXT",
  SIZE: "TECH_SIZE_BYTES",
  CREATED_AT: "TECH_CREATED_SRC_AT",
  UPDATED_AT: "TECH_UPDATED_SRC_AT",
  HASH: "TECH_CONTENT_HASH",
  STORAGE_URI: "TECH_STORAGE_URI",
  ACCESS_LEVEL: "TECH_ACCESS_LEVEL",
  SOFTWARE: "TECH_SOFTWARE",

  // New technical/administrative metadata
  DESCRIPTION_LEVEL: "NIVEL_DESCRIPCION", // e.g., DOCUMENTO
  DOCUMENT_CODE: "DOC_CODE", // current numero_serie (TMP / OFI...)
  OFFICIAL_CODE: "CODIGO_OFICIAL", // only when official index exists

  CURRENT_VERSION_ID: "VERSION_ACTUAL_ID",
  CURRENT_VERSION_NAME: "VERSION_ACTUAL_NOMBRE",
  TOTAL_VERSIONS: "TOTAL_VERSIONES",
};

export const DESC_KEYS = {
  TITLE: "DESC_TITLE",
  AUTHOR: "DESC_AUTHOR",
  UNIT_ID: "DESC_RESPONSIBLE_UNIT_ID",
  KEYWORDS: "DESC_KEYWORDS_JSON",
  PRELIM_CLASS: "DESC_PRELIM_CLASS",
  CLASS_CODE: "DESC_CLASSIFICATION_CODE",

  // Kept for future use; no longer required nor set by HU-012 for now.
  RETENTION_YEARS: "DESC_RETENTION_YEARS",
};

function nowIso() {
  return new Date().toISOString();
}

export const documentMetadataService = {
  /**
   * Capture technical metadata automatically.
   * Called on create and on content updates.
   *
   * If `content` is omitted, size/hash are preserved from existing metadata.
   */
  async captureTechnical({
    documento_id,
    mimeType,
    fileExt,
    content,
    storageUri,
    actorId = null,
    software = "Patrimonius Editor", // default
  }) {
    const current = await metadatoRepo.getMap(documento_id);

    const hasContent = typeof content === "string";
    const sizeBytes = hasContent
      ? Buffer.byteLength(String(content), "utf8")
      : current[TECH_KEYS.SIZE]
      ? Number(current[TECH_KEYS.SIZE]) || 0
      : 0;

    const hash = hasContent
      ? sha256Hex(content)
      : current[TECH_KEYS.HASH] ?? null;

    const createdAt = current[TECH_KEYS.CREATED_AT] || nowIso();

    // Read authoritative document data
    const doc = await documentoRepo.findById(documento_id);
    const accessLevel =
      doc?.confid_level || current[TECH_KEYS.ACCESS_LEVEL] || "PUBLIC";

    const descriptionLevel =
      current[TECH_KEYS.DESCRIPTION_LEVEL] || "DOCUMENTO";

    const documentCode =
      doc?.numero_serie || current[TECH_KEYS.DOCUMENT_CODE] || "";

    // Only persist official code when the external index is already official
    const officialCode =
      documentCode && String(documentCode).startsWith("OFI")
        ? documentCode
        : current[TECH_KEYS.OFFICIAL_CODE] || "";

    // Version summary
    const latestVersion = await documentoRepo.getLatestVersion(documento_id);
    const totalVersions = await documentoRepo.countVersions(documento_id);

    const map = {
      [TECH_KEYS.MIME]: mimeType || current[TECH_KEYS.MIME] || "text/html",
      [TECH_KEYS.EXT]: fileExt || current[TECH_KEYS.EXT] || "html",
      [TECH_KEYS.SIZE]: String(sizeBytes),
      [TECH_KEYS.CREATED_AT]: createdAt,
      [TECH_KEYS.UPDATED_AT]: nowIso(),
      [TECH_KEYS.HASH]: hash ?? current[TECH_KEYS.HASH] ?? "",
      [TECH_KEYS.STORAGE_URI]:
        storageUri ?? current[TECH_KEYS.STORAGE_URI] ?? "",
      [TECH_KEYS.ACCESS_LEVEL]: accessLevel,
      [TECH_KEYS.SOFTWARE]: software,

      [TECH_KEYS.DESCRIPTION_LEVEL]: descriptionLevel,
      [TECH_KEYS.DOCUMENT_CODE]: documentCode,
      [TECH_KEYS.OFFICIAL_CODE]: officialCode,

      [TECH_KEYS.CURRENT_VERSION_ID]: latestVersion?.id
        ? String(latestVersion.id)
        : current[TECH_KEYS.CURRENT_VERSION_ID] || "",
      [TECH_KEYS.CURRENT_VERSION_NAME]:
        latestVersion?.nombre_versionado ||
        current[TECH_KEYS.CURRENT_VERSION_NAME] ||
        "",
      [TECH_KEYS.TOTAL_VERSIONS]: String(
        Number.isFinite(totalVersions) ? totalVersions : 0
      ),
    };

    await metadatoRepo.upsertMap(documento_id, map);

    // Persist hash into Documento if we actually recomputed it
    if (hasContent && hash) {
      await documentoRepo.update(documento_id, { contenido_hash: hash });
    }

    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "TECH_METADATA_CAPTURED",
      resultado: "OK",
      usuario_id: actorId ?? 1,
      documento_id,
    });
    await bitacoraRepo.insertActividad({
      id: baseId,
      actividad: "OTRA",
      recurso: "METADATA",
      parametros: JSON.stringify({
        type: "TECH",
        sizeBytes,
        mimeType: map[TECH_KEYS.MIME],
        accessLevel,
      }),
    });

    return map;
  },

  /**
   * Read combined metadata for UI (technical + descriptive).
   */
  async readCombined(documento_id) {
    const map = await metadatoRepo.getMap(documento_id);

    return {
      technical: {
        mimeType: map[TECH_KEYS.MIME] || null,
        fileExt: map[TECH_KEYS.EXT] || null,
        sizeBytes: map[TECH_KEYS.SIZE] ? Number(map[TECH_KEYS.SIZE]) : null,
        createdAt: map[TECH_KEYS.CREATED_AT] || null,
        updatedAt: map[TECH_KEYS.UPDATED_AT] || null,
        contentHash: map[TECH_KEYS.HASH] || null,
        storageUri: map[TECH_KEYS.STORAGE_URI] || null,
        accessLevel: map[TECH_KEYS.ACCESS_LEVEL] || null,
        software: map[TECH_KEYS.SOFTWARE] || null,

        descriptionLevel: map[TECH_KEYS.DESCRIPTION_LEVEL] || null,
        documentCode: map[TECH_KEYS.DOCUMENT_CODE] || null,
        officialCode: map[TECH_KEYS.OFFICIAL_CODE] || null,
        currentVersionId: map[TECH_KEYS.CURRENT_VERSION_ID]
          ? Number(map[TECH_KEYS.CURRENT_VERSION_ID])
          : null,
        currentVersionName: map[TECH_KEYS.CURRENT_VERSION_NAME] || null,
        totalVersions: map[TECH_KEYS.TOTAL_VERSIONS]
          ? Number(map[TECH_KEYS.TOTAL_VERSIONS])
          : null,
      },
      descriptive: {
        title: map[DESC_KEYS.TITLE] || null,
        author: map[DESC_KEYS.AUTHOR] || null,
        responsibleUnitId: map[DESC_KEYS.UNIT_ID]
          ? Number(map[DESC_KEYS.UNIT_ID])
          : null,
        keywords: map[DESC_KEYS.KEYWORDS]
          ? JSON.parse(map[DESC_KEYS.KEYWORDS])
          : [],
        preliminaryClass: map[DESC_KEYS.PRELIM_CLASS] || null,
        classificationCode: map[DESC_KEYS.CLASS_CODE] || null,
        // retentionYears is left for future administrative use; not required
        retentionYears: map[DESC_KEYS.RETENTION_YEARS]
          ? Number(map[DESC_KEYS.RETENTION_YEARS])
          : null,
      },
    };
  },

  /**
   * Set descriptive metadata (manual).
   * Validates and persists. Updates Documento.titulo.
   * Author and responsible unit are injected automatically from
   * the document and the acting user.
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

    const keywordsArr = normalizeKeywords(parsed.keywords);
    if (!keywordsArr.length) {
      const e = new Error("At least one keyword is required");
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }

    // Build automatic author name
    const authorName = actor
      ? [actor.nombre, actor.apellido1, actor.apellido2]
          .filter(Boolean)
          .join(" ")
          .trim()
      : "DESCONOCIDO";

    // Responsible unit: prefer document unit, fall back to actor's unit
    const responsibleUnitId =
      doc.unidad_id ?? actor?.unidad_id ?? actor?.unidadId ?? null;

    if (!responsibleUnitId) {
      const e = new Error("Responsible unit could not be determined");
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }

    const map = {
      [DESC_KEYS.TITLE]: parsed.title,
      [DESC_KEYS.AUTHOR]: authorName,
      [DESC_KEYS.UNIT_ID]: String(responsibleUnitId),
      [DESC_KEYS.KEYWORDS]: JSON.stringify(keywordsArr),
      [DESC_KEYS.PRELIM_CLASS]: parsed.preliminaryClass,
      [DESC_KEYS.CLASS_CODE]: parsed.classificationCode,
      // RETENTION_YEARS intentionally not set here for now
    };

    await metadatoRepo.upsertMap(documento_id, map);
    await documentoRepo.update(documento_id, { titulo: parsed.title });

    const baseId = await bitacoraRepo.insertBase({
      fecha: new Date(),
      accion: "DESCRIPTIVE_METADATA_SET",
      resultado: "OK",
      usuario_id: actorId,
      documento_id,
    });
    await bitacoraRepo.insertActividad({
      id: baseId,
      actividad: "OTRA",
      recurso: "METADATA",
      parametros: JSON.stringify({
        type: "DESC",
        keys: Object.keys(map),
      }),
    });

    await logAdminAction({
      actorId,
      action: "DESCRIPTIVE_METADATA_SET",
      result: "OK",
      detail: { documento_id },
    });

    return { ok: true };
  },

  /**
   * Guard rule for signature: required descriptive metadata must be present.
   *
   * Required:
   * - title
   * - author (auto)
   * - responsible unit (auto)
   * - at least one keyword
   * - preliminaryClass
   * - classificationCode
   *
   * Not required:
   * - retentionYears
   * - pages (removed)
   */
  async ensureDescriptiveComplete(documento_id) {
    const map = await metadatoRepo.getMap(documento_id);
    const missing = [];

    if (!map[DESC_KEYS.TITLE]) missing.push("title");
    if (!map[DESC_KEYS.AUTHOR]) missing.push("author");
    if (!map[DESC_KEYS.UNIT_ID]) missing.push("responsibleUnitId");

    const kw = map[DESC_KEYS.KEYWORDS]
      ? JSON.parse(map[DESC_KEYS.KEYWORDS])
      : [];
    if (!Array.isArray(kw) || kw.length === 0) missing.push("keywords");

    if (!map[DESC_KEYS.PRELIM_CLASS]) missing.push("preliminaryClass");
    if (!map[DESC_KEYS.CLASS_CODE]) missing.push("classificationCode");

    if (missing.length) {
      const e = new Error(
        `Missing required descriptive metadata: ${missing.join(", ")}`
      );
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }
  },
};

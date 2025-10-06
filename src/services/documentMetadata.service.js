// src/services/documentMetadata.service.js
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { bitacoraRepo, logAdminAction } from "../repositories/bitacoraRepo.js";
import { sha256Hex } from "../utils/hash.js";
import {
  descriptiveMetadataSchema,
  normalizeKeywords,
} from "../utils/metadataSchemas.js";

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
};

export const DESC_KEYS = {
  TITLE: "DESC_TITLE",
  AUTHOR: "DESC_AUTHOR",
  UNIT_ID: "DESC_RESPONSIBLE_UNIT_ID",
  KEYWORDS: "DESC_KEYWORDS_JSON",
  PRELIM_CLASS: "DESC_PRELIM_CLASS",
  CLASS_CODE: "DESC_CLASSIFICATION_CODE",
  RETENTION_YEARS: "DESC_RETENTION_YEARS",
  PAGES: "DESC_PAGES",
};

function nowIso() {
  return new Date().toISOString();
}

export const documentMetadataService = {
  /**
   * Capture technical metadata automatically.
   * Called on create and on content updates.
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
    const sizeBytes = content ? Buffer.byteLength(String(content), "utf8") : 0;
    const hash = content ? sha256Hex(content) : null;

    const current = await metadatoRepo.getMap(documento_id);
    const createdAt = current[TECH_KEYS.CREATED_AT] || nowIso();

    // Read access level from Documento (authoritative)
    const doc = await documentoRepo.findById(documento_id);
    const accessLevel =
      doc?.confid_level || current[TECH_KEYS.ACCESS_LEVEL] || "PUBLIC";

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
    };
    await metadatoRepo.upsertMap(documento_id, map);

    if (hash) {
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

  /** Read combined metadata for UI. */
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
        retentionYears: map[DESC_KEYS.RETENTION_YEARS]
          ? Number(map[DESC_KEYS.RETENTION_YEARS])
          : null,
        pages: map[DESC_KEYS.PAGES] ? Number(map[DESC_KEYS.PAGES]) : null,
      },
    };
  },

  /**
   * Set descriptive metadata (manual).
   * Validates and persists. Logs the operation. Updates Documento.titulo.
   */
  async setDescriptive({ documento_id, input, actorId }) {
    const parsed = descriptiveMetadataSchema.parse(input);

    const keywordsArr = normalizeKeywords(parsed.keywords);
    if (!keywordsArr.length) {
      const e = new Error("At least one keyword is required");
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }

    const map = {
      [DESC_KEYS.TITLE]: parsed.title,
      [DESC_KEYS.AUTHOR]: parsed.author,
      [DESC_KEYS.UNIT_ID]: String(parsed.responsibleUnitId),
      [DESC_KEYS.KEYWORDS]: JSON.stringify(keywordsArr),
      [DESC_KEYS.PRELIM_CLASS]: parsed.preliminaryClass,
      [DESC_KEYS.CLASS_CODE]: parsed.classificationCode,
      [DESC_KEYS.RETENTION_YEARS]: String(parsed.retentionYears),
    };

    if (parsed.pages != null) {
      map[DESC_KEYS.PAGES] = String(parsed.pages);
    }

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

  /** Guard rule for signature: required descriptive metadata must be present. */
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
    if (!map[DESC_KEYS.RETENTION_YEARS]) missing.push("retentionYears");

    if (missing.length) {
      const e = new Error(
        `Missing required descriptive metadata: ${missing.join(", ")}`
      );
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }
  },
};

import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { userRepo } from "../repositories/userRepo.js";
import { bitacoraRepo, logAdminAction } from "../repositories/bitacoraRepo.js";
import { sha256Hex } from "../utils/hash.js";
import {
  descriptiveMetadataSchema,
  normalizeKeywords,
} from "../utils/metadataSchemas.js";
import { pool } from "../db/pool.js";

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

const LEGACY_DESC_KEYS = {
  TITLE: "DESC_TITLE",
  AUTHOR: "DESC_AUTHOR",
  UNIT_ID: "DESC_RESPONSIBLE_UNIT_ID",
  KEYWORDS: "DESC_KEYWORDS_JSON",
  PRELIM_CLASS: "DESC_PRELIM_CLASS",
  CLASS_CODE: "DESC_CLASSIFICATION_CODE",
};

export const AUTO_KEYS = {
  IDENTIFIER: "EDIT_AUTO_IDENTIFIER",
  CREATION_RESPONSIBLE: "EDIT_AUTO_CREATION_RESPONSIBLE",
  CREATED_AT: "EDIT_AUTO_CREATED_AT",
  MODIFICATION_RESPONSIBLE: "EDIT_AUTO_MODIFICATION_RESPONSIBLE",
  MODIFIED_AT: "EDIT_AUTO_MODIFIED_AT",
  APPROVAL_RESPONSIBLE: "EDIT_AUTO_APPROVAL_RESPONSIBLE",
  APPROVED_AT: "EDIT_AUTO_APPROVED_AT",
  SOFTWARE: "EDIT_AUTO_SOFTWARE_VERSION",
};

export const MANUAL_KEYS = {
  DOCUMENT_TYPE: "EDIT_MANUAL_DOCUMENT_TYPE",
  PRODUCER_UNIT_ID: "EDIT_MANUAL_PRODUCER_UNIT_ID",
  TITLE: "EDIT_MANUAL_TITLE",
  KEYWORDS: "EDIT_MANUAL_KEYWORDS_JSON",
  ACCESS_LEVEL: "EDIT_MANUAL_ACCESS_LEVEL",
};

function nowIso() {
  return new Date().toISOString();
}

function pickFirst(map, keys) {
  for (const key of keys) {
    const value = map?.[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function resolveUnitName(unitId) {
  if (!unitId) return null;
  const [rows] = await pool.query(
    `SELECT nombre FROM Unidad_Organizacional WHERE id = ?`,
    [unitId],
  );
  return rows[0]?.nombre ?? null;
}

async function resolveUserFullName(userId) {
  if (!userId) return null;
  const u = await userRepo.findById(userId);
  if (!u) return null;
  return [u.nombre, u.apellido1, u.apellido2].filter(Boolean).join(" ").trim();
}

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

export const documentMetadataService = {
  async captureTechnical({
    documento_id,
    mimeType,
    fileExt,
    content,
    storageUri,
    actorId = null,
    software = process.env.APP_SOFTWARE_VERSION || "Patrimonius Editor v1.0",
  }) {
    const sizeBytes = content ? Buffer.byteLength(String(content), "utf8") : 0;
    const hash = content ? sha256Hex(content) : null;

    const [current, doc] = await Promise.all([
      metadatoRepo.getMap(documento_id),
      documentoRepo.findById(documento_id),
    ]);

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

    const accessLevel =
      doc?.confid_level ||
      pickFirst(current, [
        MANUAL_KEYS.ACCESS_LEVEL,
        LEGACY_TECH_KEYS.ACCESS_LEVEL,
      ]) ||
      "PUBLIC";

    const map = {
      [AUTO_KEYS.IDENTIFIER]: identifier,
      [AUTO_KEYS.CREATION_RESPONSIBLE]: creatorName || "DESCONOCIDO",
      [AUTO_KEYS.CREATED_AT]: createdAt,
      [AUTO_KEYS.MODIFICATION_RESPONSIBLE]:
        modifierName || creatorName || "DESCONOCIDO",
      [AUTO_KEYS.MODIFIED_AT]: updatedAt,
      [AUTO_KEYS.SOFTWARE]: software,

      // Legacy write-through
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
        identifier,
        sizeBytes,
        accessLevel,
        software,
      }),
    });

    return map;
  },

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

  async readCombined(documento_id) {
    const [map, doc] = await Promise.all([
      metadatoRepo.getMap(documento_id),
      documentoRepo.findById(documento_id),
    ]);

    const producerUnitIdRaw = pickFirst(map, [
      MANUAL_KEYS.PRODUCER_UNIT_ID,
      LEGACY_DESC_KEYS.UNIT_ID,
    ]);

    const producerUnitId = producerUnitIdRaw ? Number(producerUnitIdRaw) : null;

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
        producerUnitId,
        producerUnitName,
        title,
        keywords,
        accessLevel,
      },
    };
  },

  async setDescriptive({ documento_id, input, actorId }) {
    const parsed = descriptiveMetadataSchema.parse(input);

    const doc = await documentoRepo.findById(documento_id);
    if (!doc) {
      const e = new Error("Document not found");
      e.code = "NOT_FOUND";
      throw e;
    }

    const producerUnitName = await resolveUnitName(parsed.producerUnitId);
    if (!producerUnitName) {
      const e = new Error("Producer unit is invalid");
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }

    const keywordsArr = normalizeKeywords(parsed.keywords);

    const map = {
      [MANUAL_KEYS.DOCUMENT_TYPE]: parsed.documentType,
      [MANUAL_KEYS.PRODUCER_UNIT_ID]: String(parsed.producerUnitId),
      [MANUAL_KEYS.TITLE]: parsed.title,
      [MANUAL_KEYS.KEYWORDS]: JSON.stringify(keywordsArr),
      [MANUAL_KEYS.ACCESS_LEVEL]: parsed.accessLevel,

      // Legacy compatibility
      [LEGACY_DESC_KEYS.TITLE]: parsed.title,
      [LEGACY_DESC_KEYS.UNIT_ID]: String(parsed.producerUnitId),
      [LEGACY_DESC_KEYS.KEYWORDS]: JSON.stringify(keywordsArr),
      [LEGACY_DESC_KEYS.PRELIM_CLASS]: parsed.documentType,
      [LEGACY_TECH_KEYS.ACCESS_LEVEL]: parsed.accessLevel,
    };

    await metadatoRepo.upsertMap(documento_id, map);

    await documentoRepo.update(documento_id, {
      titulo: parsed.title,
      confid_level: parsed.accessLevel,
    });

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
        type: "EDIT_METADATA",
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

  async ensureDescriptiveComplete(documento_id) {
    const map = await metadatoRepo.getMap(documento_id);
    const missing = [];

    if (
      !pickFirst(map, [
        MANUAL_KEYS.DOCUMENT_TYPE,
        LEGACY_DESC_KEYS.PRELIM_CLASS,
      ])
    ) {
      missing.push("documentType");
    }

    if (
      !pickFirst(map, [MANUAL_KEYS.PRODUCER_UNIT_ID, LEGACY_DESC_KEYS.UNIT_ID])
    ) {
      missing.push("producerUnitId");
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
      const e = new Error(
        `Missing required descriptive metadata: ${missing.join(", ")}`,
      );
      e.code = "MISSING_REQUIRED_METADATA";
      throw e;
    }
  },
};

import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { conservationIntakeRepo } from "../repositories/conservationIntake.repository.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { userRepo } from "../repositories/userRepo.js";
import {
  conservationAuditSchema,
  conservationIntakeSchema,
  conservationSearchSchema,
  duplicateCheckSchema,
  normalizeEmailsArray,
  normalizeKeywordsArray,
} from "../validators/conservationIntake.schema.js";

const ALLOW_UNSIGNED_CONSERVATION =
  process.env.HU019_ALLOW_UNSIGNED_CONSERVATION !== "false";

const ALLOW_ANY_DOCUMENT_FOR_CONSERVATION =
  process.env.HU019_ALLOW_ANY_DOCUMENT_FOR_CONSERVATION !== "false";

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

function isOfficialCodeComplete(code) {
  return typeof code === "string" && code.trim().length >= 8;
}

function addYearsToDate(dateIso, years) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setFullYear(date.getFullYear() + Number(years || 0));
  return date.toISOString().slice(0, 10);
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

async function resolveActorName(actorId) {
  if (!actorId) return "DESCONOCIDO";
  const actor = await userRepo.findById(actorId);
  if (!actor) return "DESCONOCIDO";
  return [actor.nombre, actor.apellido1, actor.apellido2]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Bitácora ciclo documental.
 */
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

/**
 * UI audit remains fire-and-forget.
 */
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
  finalOfficialCode,
  classificationCode,
  classificationLabel,
  retentionRule,
  retentionEndDate,
  actorId,
  actorName,
  automatic,
}) {
  const keywords = normalizeKeywordsArray(payload.metadata.keywords);

  const map = {
    CODIGO_OFICIAL: finalOfficialCode,
    [LEGACY_KEYS.DOC_CODE]: finalOfficialCode,
    [LEGACY_KEYS.TITLE]: payload.metadata.title,
    [LEGACY_KEYS.AUTHOR]: automatic.creatorName,
    [LEGACY_KEYS.KEYWORDS]: JSON.stringify(keywords),
    [LEGACY_KEYS.CLASS_CODE]: classificationCode,

    ARCH_PRODUCING_UNIT: payload.metadata.producingUnit,
    ARCH_ACCESS_LEVEL: payload.metadata.accessLevel,
    ARCH_CLASSIFICATION_CODE: classificationCode,
    ARCH_CLASSIFICATION_LABEL: classificationLabel,
    ARCH_RETENTION_RULE_ID: String(payload.retention.ruleId),
    ARCH_RETENTION_RULE_LABEL: retentionRule.label,
    ARCH_RETENTION_YEARS: String(retentionRule.years),
    ARCH_RETENTION_START_DATE: payload.retention.startDateISO,
    ARCH_RETENTION_END_DATE: retentionEndDate,
    ARCH_TRACKING_ENABLED: String(Boolean(payload.retention.trackingEnabled)),
    ARCH_CONSERVATION_STATUS: "REGISTERED",
    ARCH_CONSERVATION_REGISTERED_AT: new Date().toISOString(),
    ARCH_CONSERVATION_REGISTERED_BY: String(actorId),

    [FINAL_KEYS.FLOW]: payload.metadata.documentFlow,
    [FINAL_KEYS.REFERENCE_CODE]: finalOfficialCode,
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
    [FINAL_KEYS.CLASSIFICATION_CODE]: classificationCode,
    [FINAL_KEYS.CLASSIFICATION_LABEL]: classificationLabel,

    [FINAL_KEYS.RETENTION_RULE_ID]: String(payload.retention.ruleId),
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

export const conservationIntakeService = {
  async searchCandidates(rawFilters) {
    const filters = conservationSearchSchema.parse(rawFilters);
    const rows = await conservationIntakeRepo.searchCandidates(filters);

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

  async listRetentionRules() {
    return conservationIntakeRepo.listRetentionRules();
  },

  async registerIntake(rawPayload, actor) {
    const payload = conservationIntakeSchema.parse(rawPayload);
    const actorId = Number(
      actor?.id || actor?.userId || actor?.usuario_id || 0,
    );

    if (!actorId) {
      const error = new Error("Unauthorized");
      error.code = "UNAUTHORIZED";
      throw error;
    }

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

    if (
      !isOfficialCodeComplete(payload.officialCode) &&
      !isOfficialCodeComplete(doc.numero_serie)
    ) {
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

    const currentStructuredCode =
      conservationIntakeRepo.isStructuredReferenceCode(doc.numero_serie)
        ? conservationIntakeRepo.normalizeReferenceCode(doc.numero_serie)
        : null;

    if (currentStructuredCode) {
      const duplicateByStructuredCode =
        await conservationIntakeRepo.findExistingIntakeByOfficialCode(
          currentStructuredCode,
        );

      if (
        duplicateByStructuredCode &&
        Number(duplicateByStructuredCode.documentId) !==
          Number(payload.candidateId)
      ) {
        const error = new Error("Official code already exists in conservation");
        error.code = "DUPLICATE_OFFICIAL_CODE";
        error.status = 409;
        error.extra = {
          existingId: Number(duplicateByStructuredCode.documentId),
        };
        throw error;
      }
    }

    const [serie, subserie, expediente, retentionRule] = await Promise.all([
      conservationIntakeRepo.findSerieById(payload.classification.serieId),
      payload.classification.subserieId != null
        ? conservationIntakeRepo.findSubserieById(
            payload.classification.subserieId,
          )
        : Promise.resolve(null),
      conservationIntakeRepo.findExpedienteById(
        payload.classification.expedienteId,
      ),
      conservationIntakeRepo.findRetentionRuleById(payload.retention.ruleId),
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

    if (!retentionRule || Number(retentionRule.activa) !== 1) {
      const error = new Error("Invalid retention rule");
      error.code = "INVALID_RETENTION_RULE";
      throw error;
    }

    const classificationCode = String(
      payload.classification.code ||
        expediente.codigo ||
        subserie?.codigo ||
        serie.codigo ||
        "",
    ).trim();

    if (!classificationCode) {
      const error = new Error(
        "Invalid archival structure: classification code could not be resolved",
      );
      error.code = "INVALID_ARCHIVAL_STRUCTURE";
      throw error;
    }

    const classificationLabel = buildFinalClassificationLabel({
      serie,
      subserie,
      expediente,
      fallback: payload.classification.label,
    });

    const resolvedDocumentType =
      String(payload.metadata.documentType || "").trim() ||
      String(
        pickFirst(docMetadataMap, [
          EDIT_KEYS.DOCUMENT_TYPE,
          LEGACY_KEYS.CLASS_CODE,
        ]) || "",
      ).trim();

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
      !payload.metadata.producingUnit?.trim() ||
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
      payload.retention.startDateISO,
      retentionRule.years,
    );

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

    let finalOfficialCode = null;

    const result = await conservationIntakeRepo.withTransaction(
      async (conn) => {
        finalOfficialCode =
          await conservationIntakeRepo.generateReferenceCodeTx(conn, {
            currentCode: doc.numero_serie,
            documentType: resolvedDocumentType,
            unitName: payload.metadata.producingUnit,
          });

        const duplicateByFinalCode =
          await conservationIntakeRepo.findExistingIntakeByOfficialCode(
            finalOfficialCode,
          );

        if (
          duplicateByFinalCode &&
          Number(duplicateByFinalCode.documentId) !==
            Number(payload.candidateId)
        ) {
          const error = new Error(
            "Official code already exists in conservation",
          );
          error.code = "DUPLICATE_OFFICIAL_CODE";
          error.status = 409;
          error.extra = { existingId: Number(duplicateByFinalCode.documentId) };
          throw error;
        }

        const payloadSnapshot = {
          ...payload,
          officialCode: finalOfficialCode,
          metadata: {
            ...payload.metadata,
            documentType: resolvedDocumentType,
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
            endDateISO: retentionEndDate,
            years: retentionRule.years,
            label: retentionRule.label,
          },
          automatic: {
            ...automatic,
            dispatchResponsible:
              payload.metadata.documentFlow === "PRODUCED_SENT"
                ? actorName
                : null,
            receiptResponsible:
              payload.metadata.documentFlow === "RECEIVED" ? actorName : null,
          },
        };

        const metadataMap = buildArchivalMetadataMap({
          payload: {
            ...payload,
            officialCode: finalOfficialCode,
            metadata: {
              ...payload.metadata,
              documentType: resolvedDocumentType,
              keywords: resolvedKeywords,
              sizeBytes: resolvedSizeBytes,
              format: resolvedFormat,
              signers: resolvedSigners,
              signedAt: resolvedSignedAt,
              softwareVersion: resolvedSoftwareVersion,
            },
          },
          finalOfficialCode,
          classificationCode,
          classificationLabel,
          retentionRule,
          retentionEndDate,
          actorId,
          actorName,
          automatic,
        });

        await conservationIntakeRepo.updateDocumentForConservationTx(conn, {
          documentId: payload.candidateId,
          expedienteId: payload.classification.expedienteId,
          title: payload.metadata.title.trim(),
          accessLevel: payload.metadata.accessLevel,
          officialCode: finalOfficialCode,
        });

        await conservationIntakeRepo.upsertMetadataMapTx(
          conn,
          payload.candidateId,
          metadataMap,
        );

        return conservationIntakeRepo.insertIntakeTx(conn, {
          documentId: payload.candidateId,
          officialCode: finalOfficialCode,
          classificationCode,
          classificationLabel,
          accessLevel: payload.metadata.accessLevel,
          retentionRuleId: retentionRule.id,
          retentionYears: retentionRule.years,
          retentionStartDate: payload.retention.startDateISO,
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
        officialCode: finalOfficialCode,
        classificationCode,
        retentionRuleId: retentionRule.id,
        retentionStartDate: payload.retention.startDateISO,
        retentionEndDate,
        trackingEnabled: payload.retention.trackingEnabled,
        documentFlow: payload.metadata.documentFlow,
        expedienteId: payload.classification.expedienteId,
      },
    });

    return {
      intakeId: `INTAKE-${result.id}`,
      id: result.id,
      officialCode: finalOfficialCode,
      message: "Document successfully registered in conservation",
    };
  },

  async audit(rawPayload, actor) {
    const payload = conservationAuditSchema.parse(rawPayload);
    const actorId = Number(
      actor?.id || actor?.userId || actor?.usuario_id || 0,
    );

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
};

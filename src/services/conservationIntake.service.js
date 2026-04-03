import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { conservationIntakeRepo } from "../repositories/conservationIntake.repository.js";
import {
  conservationAuditSchema,
  conservationIntakeSchema,
  conservationSearchSchema,
  duplicateCheckSchema,
  normalizeKeywordsArray,
} from "../validators/conservationIntake.schema.js";

const ALLOW_UNSIGNED_CONSERVATION =
  process.env.HU019_ALLOW_UNSIGNED_CONSERVATION !== "false";

const ALLOW_ANY_DOCUMENT_FOR_CONSERVATION =
  process.env.HU019_ALLOW_ANY_DOCUMENT_FOR_CONSERVATION !== "false";

function isOfficialCodeComplete(code) {
  return typeof code === "string" && code.trim().length >= 8;
}

function addYearsToDate(dateIso, years) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setFullYear(date.getFullYear() + Number(years || 0));
  return date.toISOString().slice(0, 10);
}

/** Bitácora ciclo documental: VW_* lee `accion_solicitada` y `motivo` desde detalle JSON; `resultado` va en Bitacora_Base (PERMITIDO | DENEGADO). */
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

/** La bitácora de actividad de usuario ya no registra eventos HU019 (solo solicitudes de acceso). */
async function logUiActivity(_payload) {
  return null;
}

function buildArchivalMetadataMap({
  payload,
  retentionRule,
  retentionEndDate,
  actorId,
}) {
  const keywords = normalizeKeywordsArray(payload.metadata.keywords);

  return {
    CODIGO_OFICIAL: payload.officialCode,
    TECH_DOCUMENT_CODE: payload.officialCode,
    DESC_TITLE: payload.metadata.title,
    DESC_AUTHOR: payload.metadata.author,
    DESC_KEYWORDS_JSON: JSON.stringify(keywords),
    DESC_CLASSIFICATION_CODE: payload.classification.code,
    ARCH_PRODUCING_UNIT: payload.metadata.producingUnit,
    ARCH_ACCESS_LEVEL: payload.metadata.accessLevel,
    ARCH_CLASSIFICATION_CODE: payload.classification.code,
    ARCH_CLASSIFICATION_LABEL: payload.classification.label,
    ARCH_RETENTION_RULE_ID: String(payload.retention.ruleId),
    ARCH_RETENTION_RULE_LABEL: retentionRule.label,
    ARCH_RETENTION_YEARS: String(retentionRule.years),
    ARCH_RETENTION_START_DATE: payload.retention.startDateISO,
    ARCH_RETENTION_END_DATE: retentionEndDate,
    ARCH_TRACKING_ENABLED: String(Boolean(payload.retention.trackingEnabled)),
    ARCH_CONSERVATION_STATUS: "REGISTERED",
    ARCH_CONSERVATION_REGISTERED_AT: new Date().toISOString(),
    ARCH_CONSERVATION_REGISTERED_BY: String(actorId),
  };
}

export const conservationIntakeService = {
  /**
   * Return available conservation candidates.
   * Signature and PDF/A checks remain temporarily relaxed by business rule.
   */
  async searchCandidates(rawFilters) {
    const filters = conservationSearchSchema.parse(rawFilters);
    const rows = await conservationIntakeRepo.searchCandidates(filters);

    let mapped = rows.map((row) => {
      const actualPdfA =
        String(row.mimeType || "")
          .toLowerCase()
          .includes("pdf") ||
        String(row.fileExt || "").toLowerCase() === "pdf" ||
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
        producingUnit: row.producingUnit,
        createdAtISO: row.createdAtISO,
        author: row.author || "",
        isPDFA: ALLOW_ANY_DOCUMENT_FOR_CONSERVATION ? true : actualPdfA,
        signaturesComplete: ALLOW_UNSIGNED_CONSERVATION
          ? true
          : actualSignaturesComplete,
        keywords: Array.isArray(row.keywords) ? row.keywords : [],
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

  /**
   * Register document intake into conservation.
   * Author is resolved automatically from the document creator when missing.
   */
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

    const doc = await conservationIntakeRepo.findDocumentById(
      payload.candidateId,
    );

    if (!doc) {
      const error = new Error("Document not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    if (!isOfficialCodeComplete(payload.officialCode)) {
      const error = new Error(
        "The document does not have a complete official identifier",
      );
      error.code = "INCOMPLETE_OFFICIAL_CODE";
      throw error;
    }

    if (
      String(doc.numero_serie || "").trim() !==
      String(payload.officialCode).trim()
    ) {
      const error = new Error(
        "The provided official code does not match the document official code",
      );
      error.code = "OFFICIAL_CODE_MISMATCH";
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
        payload.officialCode,
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
          officialCode: payload.officialCode,
        },
      });

      const error = new Error("Official code already exists in conservation");
      error.code = "DUPLICATE_OFFICIAL_CODE";
      error.status = 409;
      error.extra = { existingId: Number(duplicateByCode.documentId) };
      throw error;
    }

    const classification =
      await conservationIntakeRepo.findClassificationByCode(
        payload.classification.code,
      );

    if (!classification || Number(classification.activa) !== 1) {
      const error = new Error("Invalid archival classification code");
      error.code = "INVALID_CLASSIFICATION";
      throw error;
    }

    const retentionRule = await conservationIntakeRepo.findRetentionRuleById(
      payload.retention.ruleId,
    );

    if (!retentionRule || Number(retentionRule.activa) !== 1) {
      const error = new Error("Invalid retention rule");
      error.code = "INVALID_RETENTION_RULE";
      throw error;
    }

    const keywords = normalizeKeywordsArray(payload.metadata.keywords);
    const resolvedAuthor =
      String(payload.metadata.author || "").trim() ||
      String(doc.authorName || "").trim();

    const metadataIncomplete =
      !payload.metadata.title?.trim() ||
      !payload.metadata.producingUnit?.trim() ||
      !resolvedAuthor ||
      keywords.length === 0;

    if (metadataIncomplete) {
      const error = new Error("Archival metadata is incomplete");
      error.code = "INCOMPLETE_ARCHIVAL_METADATA";
      throw error;
    }

    const retentionEndDate = addYearsToDate(
      payload.retention.startDateISO,
      retentionRule.years,
    );

    const payloadSnapshot = {
      ...payload,
      metadata: {
        ...payload.metadata,
        author: resolvedAuthor,
        keywords,
      },
      classification: {
        code: classification.codigo,
        label: classification.etiqueta,
      },
    };

    const metadataMap = buildArchivalMetadataMap({
      payload: payloadSnapshot,
      retentionRule,
      retentionEndDate,
      actorId,
    });

    const result = await conservationIntakeRepo.withTransaction(
      async (conn) => {
        await conservationIntakeRepo.updateDocumentForConservationTx(conn, {
          documentId: payload.candidateId,
          title: payload.metadata.title.trim(),
          accessLevel: payload.metadata.accessLevel,
        });

        await conservationIntakeRepo.upsertMetadataMapTx(
          conn,
          payload.candidateId,
          metadataMap,
        );

        return conservationIntakeRepo.insertIntakeTx(conn, {
          documentId: payload.candidateId,
          officialCode: payload.officialCode,
          classificationCode: classification.codigo,
          classificationLabel: classification.etiqueta,
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
        officialCode: payload.officialCode,
        classificationCode: classification.codigo,
        retentionRuleId: retentionRule.id,
        retentionStartDate: payload.retention.startDateISO,
        retentionEndDate,
        trackingEnabled: payload.retention.trackingEnabled,
      },
    });

    return {
      intakeId: `INTAKE-${result.id}`,
      id: result.id,
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

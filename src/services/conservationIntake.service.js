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
  const d = new Date(`${dateIso}T00:00:00`);
  d.setFullYear(d.getFullYear() + Number(years || 0));
  return d.toISOString().slice(0, 10);
}

async function logCycleEvent({
  actorId,
  documentId = null,
  action,
  result,
  detail = {},
  event = "CONSERVACION",
}) {
  const baseId = await bitacoraRepo.insertBase({
    fecha: new Date(),
    accion: action,
    resultado: result,
    usuario_id: actorId,
    documento_id: documentId,
  });

  await bitacoraRepo.insertCiclo({
    id: baseId,
    evento: event,
    detalle: JSON.stringify(detail),
  });

  return baseId;
}

async function logUiActivity({ actorId, action, detail }) {
  const baseId = await bitacoraRepo.insertBase({
    fecha: new Date(),
    accion: action,
    resultado: "OK",
    usuario_id: actorId,
    documento_id: detail?.documentId ?? null,
  });

  await bitacoraRepo.insertActividad({
    id: baseId,
    actividad: "OTRA",
    recurso: "HU019_CONSERVATION_UI",
    parametros: JSON.stringify(detail ?? {}),
  });

  return baseId;
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
        isPDFA: ALLOW_ANY_DOCUMENT_FOR_CONSERVATION ? true : actualPdfA,
        signaturesComplete: ALLOW_UNSIGNED_CONSERVATION
          ? true
          : actualSignaturesComplete,
        keywords: Array.isArray(row.keywords) ? row.keywords : [],
      };
    });

    if (filters.pdfaOnly) {
      mapped = mapped.filter((row) => row.isPDFA);
    }

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
      const e = new Error("Unauthorized");
      e.code = "UNAUTHORIZED";
      throw e;
    }

    const doc = await conservationIntakeRepo.findDocumentById(
      payload.candidateId,
    );
    if (!doc) {
      const e = new Error("Document not found");
      e.code = "NOT_FOUND";
      throw e;
    }

    if (!isOfficialCodeComplete(payload.officialCode)) {
      const e = new Error(
        "The document does not have a complete official identifier",
      );
      e.code = "INCOMPLETE_OFFICIAL_CODE";
      throw e;
    }

    if (
      String(doc.numero_serie || "").trim() !==
      String(payload.officialCode).trim()
    ) {
      const e = new Error(
        "The provided official code does not match the document official code",
      );
      e.code = "OFFICIAL_CODE_MISMATCH";
      throw e;
    }

    const duplicateByDocument =
      await conservationIntakeRepo.findExistingIntakeByDocumentId(
        payload.candidateId,
      );

    if (duplicateByDocument) {
      const e = new Error("The document is already registered in conservation");
      e.code = "DUPLICATE_CONSERVATION_DOCUMENT";
      e.status = 409;
      throw e;
    }

    const duplicateByCode =
      await conservationIntakeRepo.findExistingIntakeByOfficialCode(
        payload.officialCode,
      );

    if (duplicateByCode) {
      await logCycleEvent({
        actorId,
        documentId: payload.candidateId,
        action: "CONSERVATION_INTAKE_REJECTED_DUPLICATE_CODE",
        result: "DUPLICATE",
        detail: {
          duplicateDocumentId: duplicateByCode.documentId,
          officialCode: payload.officialCode,
        },
      });

      const e = new Error("Official code already exists in conservation");
      e.code = "DUPLICATE_OFFICIAL_CODE";
      e.status = 409;
      e.extra = { existingId: Number(duplicateByCode.documentId) };
      throw e;
    }

    const classification =
      await conservationIntakeRepo.findClassificationByCode(
        payload.classification.code,
      );

    if (!classification || Number(classification.activa) !== 1) {
      const e = new Error("Invalid archival classification code");
      e.code = "INVALID_CLASSIFICATION";
      throw e;
    }

    const retentionRule = await conservationIntakeRepo.findRetentionRuleById(
      payload.retention.ruleId,
    );

    if (!retentionRule || Number(retentionRule.activa) !== 1) {
      const e = new Error("Invalid retention rule");
      e.code = "INVALID_RETENTION_RULE";
      throw e;
    }

    const keywords = normalizeKeywordsArray(payload.metadata.keywords);

    const metadataIncomplete =
      !payload.metadata.title?.trim() ||
      !payload.metadata.producingUnit?.trim() ||
      !payload.metadata.author?.trim() ||
      keywords.length === 0;

    if (metadataIncomplete) {
      const e = new Error("Archival metadata is incomplete");
      e.code = "INCOMPLETE_ARCHIVAL_METADATA";
      throw e;
    }

    const retentionEndDate = addYearsToDate(
      payload.retention.startDateISO,
      retentionRule.years,
    );

    const payloadSnapshot = {
      ...payload,
      metadata: {
        ...payload.metadata,
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
      action: "CONSERVATION_INTAKE_REGISTERED",
      result: "OK",
      detail: {
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
      const e = new Error("Unauthorized");
      e.code = "UNAUTHORIZED";
      throw e;
    }

    await logUiActivity({
      actorId,
      action: `HU019_${payload.event}`.toUpperCase(),
      detail: payload.detail ?? {},
    });

    return { ok: true };
  },
};

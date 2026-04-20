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

    async previewReferenceCode(rawQuery) {
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

        const preview = await this._generateFinalReferenceCode({
            currentCode: doc.numero_serie,
            documentType: resolvedDocumentType,
            producingUnit: resolvedProducingUnit,
        });

        return preview;
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
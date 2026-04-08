// src/utils/pdfMetadataEmbed.js
import { PDFDocument } from "pdf-lib";

const MANUAL_KEYS = {
    DOCUMENT_TYPE: "EDIT_MANUAL_DOCUMENT_TYPE",
    TITLE: "EDIT_MANUAL_TITLE",
    KEYWORDS: "EDIT_MANUAL_KEYWORDS_JSON",
    ACCESS_LEVEL: "EDIT_MANUAL_ACCESS_LEVEL",
};

const AUTO_KEYS = {
    IDENTIFIER: "EDIT_AUTO_IDENTIFIER",
    SIZE: "EDIT_AUTO_SIZE_BYTES",
    PRODUCER_UNIT_ID: "EDIT_AUTO_PRODUCER_UNIT_ID",
    SOFTWARE: "EDIT_AUTO_SOFTWARE_VERSION",
    CREATION_RESPONSIBLE: "EDIT_AUTO_CREATION_RESPONSIBLE",
    CREATED_AT: "EDIT_AUTO_CREATED_AT",
    MODIFICATION_RESPONSIBLE: "EDIT_AUTO_MODIFICATION_RESPONSIBLE",
    MODIFIED_AT: "EDIT_AUTO_MODIFIED_AT",
    APPROVAL_RESPONSIBLE: "EDIT_AUTO_APPROVAL_RESPONSIBLE",
    APPROVED_AT: "EDIT_AUTO_APPROVED_AT",
};

const LEGACY_DESC = {
    TITLE: "DESC_TITLE",
    AUTHOR: "DESC_AUTHOR",
    KEYWORDS_JSON: "DESC_KEYWORDS_JSON",
    CLASSIFICATION_CODE: "DESC_CLASSIFICATION_CODE",
    PRELIM_CLASS: "DESC_PRELIM_CLASS",
    UNIT_ID: "DESC_RESPONSIBLE_UNIT_ID",
};

/** Metadato explícito de código oficial (documento.service / conservación) */
const CODIGO_OFICIAL = "CODIGO_OFICIAL";

const TECH_KEYS = {
    DOCUMENT_CODE: "TECH_DOCUMENT_CODE",
};

/** conservationIntake.service FINAL_* (completo) */
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

/** Metadatos de conservación / archivo (mapa ARCH_*) */
const ARCH_KEYS = {
    PRODUCING_UNIT: "ARCH_PRODUCING_UNIT",
    ACCESS_LEVEL: "ARCH_ACCESS_LEVEL",
    CLASSIFICATION_CODE: "ARCH_CLASSIFICATION_CODE",
    CLASSIFICATION_LABEL: "ARCH_CLASSIFICATION_LABEL",
    RETENTION_RULE_LABEL: "ARCH_RETENTION_RULE_LABEL",
    RETENTION_YEARS: "ARCH_RETENTION_YEARS",
    RETENTION_START: "ARCH_RETENTION_START_DATE",
    RETENTION_END: "ARCH_RETENTION_END_DATE",
    CONSERVATION_STATUS: "ARCH_CONSERVATION_STATUS",
    CONSERVATION_REGISTERED_AT: "ARCH_CONSERVATION_REGISTERED_AT",
};

const DOCUMENT_FLOW_LABELS = {
    PRODUCED_SENT: "Documento producido / enviado",
    RECEIVED: "Documento recibido",
};

/** Nivel de acceso (códigos API → etiqueta UI es-ES) */
const ACCESS_LEVEL_LABELS_ES = {
    PUBLIC: "Público",
    INTERNAL: "Interno",
    HIGH: "Alto",
    RESTRICTED: "Restringido",
};

const ESTADO_DOCUMENTO_LABELS_ES = {
    CREACION: "Creación",
    BORRADOR: "Borrador",
    APROBADO: "Aprobado",
    FIRMA: "En firma",
    FIRMA_PARCIAL: "Firma parcial",
    FIRMA_COMPLETA: "Firma completa",
    ARCHIVADO: "Archivado",
    RECHAZADO: "Rechazado",
};

const SUBJECT_MAX_LEN = 10000;

function pickFirstString(...candidates) {
    for (const v of candidates) {
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

function parseIsoDate(value) {
    if (value == null || String(value).trim() === "") return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateForSubject(value) {
    const d = parseIsoDate(value);
    if (!d) return String(value).trim();
    try {
        return d.toLocaleString("es-ES", {
            dateStyle: "short",
            timeStyle: "short",
        });
    } catch {
        return d.toISOString();
    }
}

function labelDocumentFlow(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const key = String(raw).trim();
    return DOCUMENT_FLOW_LABELS[key] || key;
}

function labelAccessLevelEs(code) {
    if (code == null || String(code).trim() === "") return null;
    const k = String(code).trim();
    return ACCESS_LEVEL_LABELS_ES[k] || k;
}

function labelEstadoDocumentoEs(estado) {
    if (estado == null || String(estado).trim() === "") return null;
    const k = String(estado).trim();
    return ESTADO_DOCUMENTO_LABELS_ES[k] || k;
}

function parseJsonEmails(raw) {
    if (!raw || !String(raw).trim()) return null;
    try {
        const a = JSON.parse(raw);
        if (Array.isArray(a) && a.length) {
            return a.map((e) => String(e).trim()).filter(Boolean).join(", ");
        }
    } catch {
        /* ignore */
    }
    return null;
}

function summarizeSignersJson(raw) {
    if (!raw || !String(raw).trim()) return null;
    try {
        const a = JSON.parse(raw);
        if (Array.isArray(a) && a.length) {
            const names = a
                .map((x) => (typeof x === "string" ? x : x?.nombre || x?.name || JSON.stringify(x)))
                .filter(Boolean);
            if (names.length <= 5) return names.join(", ");
            return `${names.slice(0, 5).join(", ")} (+${names.length - 5})`;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function keywordsFromMap(map) {
    const raw = pickFirstString(
        map[MANUAL_KEYS.KEYWORDS],
        map[LEGACY_DESC.KEYWORDS_JSON],
    );
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed
                .map((s) => String(s).trim())
                .filter(Boolean)
                .slice(0, 50);
        }
    } catch {
        /* continuar como texto */
    }
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50);
}

function pushUnique(segments, text) {
    if (!text || !String(text).trim()) return;
    const t = String(text).trim();
    if (!segments.includes(t)) segments.push(t);
}

/**
 * @param {object} params
 * @param {object} params.doc
 * @param {Record<string, string>} params.map
 * @param {string|null} [params.producerUnitName]
 * @param {object} [params.extraContext] Resuelto en documento.service (categoría, serie, expediente…)
 * @param {string|null} [params.extraContext.categoriaNombre]
 * @param {string|null} [params.extraContext.serieNombre]
 * @param {string|null} [params.extraContext.subserieNombre]
 * @param {string|null} [params.extraContext.expedienteNombre]
 */
export function buildPdfSubjectLine({ doc, map, producerUnitName, extraContext }) {
    const m = map || {};
    const x = extraContext || {};
    const segments = [];

    const estadoLbl = labelEstadoDocumentoEs(x.estadoDocumento ?? doc?.estado);
    if (estadoLbl) {
        pushUnique(segments, `Estado del documento: ${estadoLbl}`);
    }

    if (x.categoriaNombre) {
        pushUnique(segments, `Categoría: ${x.categoriaNombre}`);
    }

    const codigoSerie = doc?.numero_serie ? String(doc.numero_serie).trim() : "";
    if (codigoSerie) {
        pushUnique(segments, `Código: ${codigoSerie}`);
    }

    const ident = pickFirstString(m[AUTO_KEYS.IDENTIFIER]);
    if (ident && ident !== codigoSerie) {
        pushUnique(segments, `Identificador: ${ident}`);
    }

    const codOfi = pickFirstString(m[CODIGO_OFICIAL], m[FINAL_KEYS.REFERENCE_CODE]);
    if (codOfi && codOfi !== codigoSerie && codOfi !== ident) {
        pushUnique(segments, `Código oficial: ${codOfi}`);
    }

    const techCode = pickFirstString(m[TECH_KEYS.DOCUMENT_CODE]);
    if (techCode && techCode !== codigoSerie && techCode !== ident) {
        pushUnique(segments, `Código técnico: ${techCode}`);
    }

    const docType = pickFirstString(m[MANUAL_KEYS.DOCUMENT_TYPE], m[FINAL_KEYS.DOCUMENT_TYPE]);
    if (docType) {
        pushUnique(segments, `Tipo documental: ${docType}`);
    }

    const access = labelAccessLevelEs(
        pickFirstString(m[MANUAL_KEYS.ACCESS_LEVEL], m[FINAL_KEYS.ACCESS_LEVEL], m[ARCH_KEYS.ACCESS_LEVEL]),
    );
    if (access) {
        pushUnique(segments, `Nivel de acceso: ${access}`);
    }

    if (producerUnitName) {
        pushUnique(segments, `Unidad productora: ${producerUnitName}`);
    }

    const finalProd = pickFirstString(m[FINAL_KEYS.PRODUCING_UNIT], m[ARCH_KEYS.PRODUCING_UNIT]);
    if (finalProd && finalProd !== producerUnitName) {
        pushUnique(segments, `Unidad productora (final): ${finalProd}`);
    }

    const prelim = pickFirstString(m[LEGACY_DESC.PRELIM_CLASS]);
    if (prelim) {
        pushUnique(segments, `Preliminar: ${prelim}`);
    }

    const classLegacy = pickFirstString(m[LEGACY_DESC.CLASSIFICATION_CODE]);
    if (classLegacy) {
        pushUnique(segments, `Clasificación (código): ${classLegacy}`);
    }

    const archClass = pickFirstString(m[ARCH_KEYS.CLASSIFICATION_LABEL], m[ARCH_KEYS.CLASSIFICATION_CODE]);
    if (archClass) {
        pushUnique(segments, `Clasificación (conservación): ${archClass}`);
    }

    const classFinal = pickFirstString(m[FINAL_KEYS.CLASSIFICATION_LABEL], m[FINAL_KEYS.CLASSIFICATION_CODE]);
    if (classFinal && classFinal !== archClass) {
        pushUnique(segments, `Clasificación archivística: ${classFinal}`);
    }

    if (x.serieNombre) {
        pushUnique(segments, `Serie: ${x.serieNombre}`);
    }
    if (x.subserieNombre) {
        pushUnique(segments, `Subserie: ${x.subserieNombre}`);
    }
    if (x.expedienteNombre) {
        pushUnique(segments, `Expediente: ${x.expedienteNombre}`);
    }

    const flow = labelDocumentFlow(m[FINAL_KEYS.FLOW]);
    if (flow) {
        pushUnique(segments, `Flujo documental: ${flow}`);
    }

    const proc = pickFirstString(m[FINAL_KEYS.PROCEDURE_TYPE]);
    if (proc) {
        pushUnique(segments, `Trámite: ${proc}`);
    }

    const destName = pickFirstString(m[FINAL_OUT_KEYS.RECIPIENT_NAME_ROLE]);
    const destInst = pickFirstString(m[FINAL_OUT_KEYS.RECIPIENT_INSTITUTION]);
    if (destName || destInst) {
        pushUnique(segments, `Destinatario: ${[destName, destInst].filter(Boolean).join(" — ")}`);
    }

    const emails = parseJsonEmails(m[FINAL_OUT_KEYS.DISPATCH_EMAILS_JSON]);
    if (emails) {
        pushUnique(segments, `Correos despacho: ${emails}`);
    }

    const dispAt = pickFirstString(m[FINAL_OUT_KEYS.DISPATCHED_AT]);
    if (dispAt) {
        pushUnique(segments, `Fecha/hora despacho: ${formatDateForSubject(dispAt)}`);
    }

    const dispBy = pickFirstString(m[FINAL_OUT_KEYS.DISPATCH_RESPONSIBLE]);
    if (dispBy) {
        pushUnique(segments, `Responsable despacho: ${dispBy}`);
    }

    const inSend = pickFirstString(m[FINAL_IN_KEYS.SENDER_NAME_ROLE]);
    const inInst = pickFirstString(m[FINAL_IN_KEYS.SENDER_INSTITUTION]);
    if (inSend || inInst) {
        pushUnique(segments, `Remitente: ${[inSend, inInst].filter(Boolean).join(" — ")}`);
    }

    const recAt = pickFirstString(m[FINAL_IN_KEYS.RECEIVED_AT]);
    if (recAt) {
        pushUnique(segments, `Fecha recepción: ${formatDateForSubject(recAt)}`);
    }

    const recBy = pickFirstString(m[FINAL_IN_KEYS.RECEIPT_RESPONSIBLE]);
    if (recBy) {
        pushUnique(segments, `Responsable recepción: ${recBy}`);
    }

    const sz = pickFirstString(m[AUTO_KEYS.SIZE], m[FINAL_KEYS.SIZE_BYTES]);
    if (sz) {
        pushUnique(segments, `Tamaño: ${sz}`);
    }

    const fmt = pickFirstString(m[FINAL_KEYS.FORMAT]);
    if (fmt) {
        pushUnique(segments, `Formato: ${fmt}`);
    }

    const sw = pickFirstString(m[AUTO_KEYS.SOFTWARE], m[FINAL_KEYS.SOFTWARE_VERSION]);
    if (sw) {
        pushUnique(segments, `Software: ${sw}`);
    }

    const signers = summarizeSignersJson(m[FINAL_KEYS.SIGNERS_JSON]);
    if (signers) {
        pushUnique(segments, `Firmantes: ${signers}`);
    }

    const retLab = pickFirstString(m[FINAL_KEYS.RETENTION_RULE_LABEL], m[ARCH_KEYS.RETENTION_RULE_LABEL]);
    const retYears = pickFirstString(m[FINAL_KEYS.RETENTION_YEARS], m[ARCH_KEYS.RETENTION_YEARS]);
    if (retLab || retYears) {
        const r = [retLab, retYears ? `${retYears} año(s)` : ""].filter(Boolean).join(" — ");
        pushUnique(segments, `Regla de retención: ${r}`);
    }

    const sd = pickFirstString(m[FINAL_KEYS.START_DATE], m[ARCH_KEYS.RETENTION_START]);
    const ed = pickFirstString(m[FINAL_KEYS.END_DATE], m[ARCH_KEYS.RETENTION_END]);
    if (sd) pushUnique(segments, `Inicio conservación: ${formatDateForSubject(sd)}`);
    if (ed) pushUnique(segments, `Fin conservación: ${formatDateForSubject(ed)}`);

    const cons = pickFirstString(m[ARCH_KEYS.CONSERVATION_STATUS]);
    if (cons) {
        pushUnique(segments, `Estado conservación: ${cons}`);
    }

    const consAt = pickFirstString(m[ARCH_KEYS.CONSERVATION_REGISTERED_AT]);
    if (consAt) {
        pushUnique(segments, `Registro conservación: ${formatDateForSubject(consAt)}`);
    }

    const cr = pickFirstString(m[AUTO_KEYS.CREATION_RESPONSIBLE]);
    if (cr) {
        pushUnique(segments, `Responsable de creación: ${cr}`);
    }

    const created = pickFirstString(m[AUTO_KEYS.CREATED_AT]);
    if (created) {
        pushUnique(segments, `Fecha de creación: ${formatDateForSubject(created)}`);
    }

    const modBy = pickFirstString(m[AUTO_KEYS.MODIFICATION_RESPONSIBLE]);
    if (modBy) {
        pushUnique(segments, `Responsable de modificación: ${modBy}`);
    }

    const modAt = pickFirstString(m[AUTO_KEYS.MODIFIED_AT]);
    if (modAt) {
        pushUnique(segments, `Fecha de modificación: ${formatDateForSubject(modAt)}`);
    }

    const apprBy = pickFirstString(m[AUTO_KEYS.APPROVAL_RESPONSIBLE]);
    if (apprBy) {
        pushUnique(segments, `Responsable de aprobación: ${apprBy}`);
    }

    const apprAt = pickFirstString(m[AUTO_KEYS.APPROVED_AT]);
    if (apprAt) {
        pushUnique(segments, `Fecha de aprobación: ${formatDateForSubject(apprAt)}`);
    }

    const kwList = keywordsFromMap(m);
    if (kwList.length) {
        pushUnique(segments, `Palabras clave: ${kwList.join(", ")}`);
    }

    let line = segments.join(" | ");
    if (line.length > SUBJECT_MAX_LEN) {
        line = `${line.slice(0, SUBJECT_MAX_LEN - 1)}…`;
    }
    return line;
}

export function resolvePdfMetadataFields({
    doc,
    metadatoMap,
    authorDisplayName,
    producerUnitName,
    extraContext,
}) {
    const map = metadatoMap || {};

    const title =
        pickFirstString(
            map[MANUAL_KEYS.TITLE],
            map[LEGACY_DESC.TITLE],
            map[FINAL_KEYS.TITLE],
            doc?.titulo,
        ) || (doc?.id != null ? `Documento ${doc.id}` : "Documento");

    const author = pickFirstString(
        map[LEGACY_DESC.AUTHOR],
        map[AUTO_KEYS.CREATION_RESPONSIBLE],
        authorDisplayName,
    );

    const subject = buildPdfSubjectLine({
        doc,
        map,
        producerUnitName,
        extraContext,
    });

    const keywords = keywordsFromMap(map);

    const creator = pickFirstString(
        map[AUTO_KEYS.SOFTWARE],
        map[FINAL_KEYS.SOFTWARE_VERSION],
        "Patrimonius",
    );

    const creationDate = parseIsoDate(map[AUTO_KEYS.CREATED_AT]);
    const modificationDate = parseIsoDate(map[AUTO_KEYS.MODIFIED_AT]);

    return {
        title,
        author: author || undefined,
        subject: subject || undefined,
        keywords: keywords.length ? keywords : undefined,
        creator,
        creationDate: creationDate || undefined,
        modificationDate: modificationDate || undefined,
    };
}

export async function embedStandardMetadataInPdfBuffer(buffer, fields) {
    if (!buffer || buffer.length === 0) return buffer;
    try {
        const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false });
        const {
            title,
            author,
            subject,
            keywords,
            creator,
            creationDate,
            modificationDate,
        } = fields;

        if (title) pdfDoc.setTitle(title);
        if (author) pdfDoc.setAuthor(author);
        if (subject) pdfDoc.setSubject(subject);
        if (keywords?.length) pdfDoc.setKeywords(keywords);

        pdfDoc.setCreator(creator || "Patrimonius");
        pdfDoc.setProducer("Patrimonius");

        if (creationDate) {
            pdfDoc.setCreationDate(creationDate);
        }
        if (modificationDate) {
            pdfDoc.setModificationDate(modificationDate);
        } else {
            pdfDoc.setModificationDate(new Date());
        }

        return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
    } catch {
        return buffer;
    }
}

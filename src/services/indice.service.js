//src/services/indice.service.js
import { indiceRepo } from "../repositories/indiceRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js"; // Si es necesario para registrar las acciones

import crypto from "crypto";
import { firmaRepo } from "../repositories/firmaRepo.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** Core for managing Índice Electrónico. */
function asInt(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
        const e = new Error(`${name} inválido`);
        e.code = 400;
        throw e;
    }
    return n;
}

function buildHash(buffer) {
    function buildObjectHash(obj) {
        return crypto
            .createHash("sha256")
            .update(JSON.stringify(obj))
            .digest("hex");
    }
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function getPreferredSignatureDate(validationResult) {
    const firmas = Array.isArray(validationResult?.firmas) ? validationResult.firmas : [];

    for (const firma of firmas) {
        const candidates = [
            firma?.fechaOficial,
            firma?.fechaFirma,
            firma?.signingTime,
            firma?.timestamp?.genTime,
            firma?.timestamp?.fechaOficial,
        ];

        for (const candidate of candidates) {
            if (!candidate) continue;
            const parsed = new Date(candidate);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }
        }
    }

    return new Date();
}

function buildIndicePayload({ documentoId, firmaId, hash, validationResult, actorId }) {
    const firmas = Array.isArray(validationResult?.firmas) ? validationResult.firmas : [];
    function buildExpedienteIndicePayload({ expedienteId, documentos, actorId }) {
        return {
            expedienteId,
            fechaGeneracion: new Date().toISOString(),
            generadoPor: actorId ?? null,
            totalDocumentos: documentos.length,
            documentos: documentos.map((doc, index) => ({
                orden: index + 1,
                documentoId: doc.id,
                titulo: doc.titulo,
                estado: doc.estado,
                numeroSerie: doc.numero_serie ?? null,
                numeroFirmas: doc.numero_firmas ?? 0,
                firmasObtenidas: doc.firmas_obtenidas ?? 0,
            })),
        };
    }
    return {
        documentoId,
        firmaId,
        algoritmoHash: "sha256",
        hashDocumento: hash,
        fechaGeneracion: new Date().toISOString(),
        resumenValidacion: {
            valido: validationResult?.valido === true,
            mensaje: validationResult?.mensaje || null,
            totalFirmas: firmas.length,
        },
        firmas: firmas.map((firma, index) => ({
            orden: index + 1,
            valido: firma?.valido === true,
            firmante: firma?.cert?.subjectCN || firma?.firmante || null,
            identificacion: firma?.cert?.serialNumber || firma?.identificacion || null,
            fechaFirma: firma?.fechaOficial || firma?.fechaFirma || firma?.signingTime || null,
            emisor: firma?.cert?.issuerCN || null,
            cadenaConfianza: firma?.cadenaConfianza?.valida ?? null,
            revocacion: firma?.revocacion?.estado || null,
            timestamp: firma?.timestamp?.valido ?? null,
        })),
        generadoPor: actorId ?? null,
    };
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function saveIndiceJsonFile({ indiceId, expedienteId, payload }) {
    const indicesDir = path.resolve(process.cwd(), "uploads", "indices");

    await fs.promises.mkdir(indicesDir, { recursive: true });

    const fileName = `indice-expediente-${expedienteId}-${indiceId}.json`;
    const filePath = path.join(indicesDir, fileName);

    await fs.promises.writeFile(
        filePath,
        JSON.stringify(payload, null, 2),
        "utf8"
    );

    return {
        fileName,
        filePath,
        relativePath: `uploads/indices/${fileName}`,
    };
}

export const indiceService = {
    async cerrarExpediente(expedienteId, actor) {
        const safeExpedienteId = asInt(expedienteId, "expedienteId");
        const actorId = actor?.id ?? actor?.usuario_id ?? null;

        const documentosExpediente = await indiceRepo.getDocumentosByExpedienteId(safeExpedienteId);

        if (!documentosExpediente.length) {
            const e = new Error("No se encontraron documentos para el expediente");
            e.code = 404;
            throw e;
        }

        const indiceJson = buildExpedienteIndicePayload({
            expedienteId: safeExpedienteId,
            documentos: documentosExpediente,
            actorId,
        });

        const hash = buildObjectHash(indiceJson);

        const existing = await indiceRepo.getIndexByHash(hash);
        if (existing) {
            return {
                duplicated: true,
                expedienteId: safeExpedienteId,
                indice: existing,
                indiceJson,
            };
        }

        // Tomamos como firma de referencia la última firma disponible
        // del último documento del expediente.
        const ultimoDocumento = documentosExpediente[documentosExpediente.length - 1];

        const firma = await firmaRepo.createFirma({
            documento_id: ultimoDocumento.id,
            usuario_id: actorId,
            fecha: new Date(),
        });

        const created = await indiceRepo.createExpedienteIndex({
            hash,
            fecha: new Date(),
            firmaId: firma.id,
            expedienteId: safeExpedienteId,
        });

        const jsonFile = await saveIndiceJsonFile({
            indiceId: created.id,
            expedienteId: safeExpedienteId,
            payload: indiceJson,
        });

        await logAdminAction({
            actorId,
            docId: ultimoDocumento.id,
            action: "EXPEDIENTE_CLOSE_INDEX_GENERATE",
            result: "OK",
            detail: {
                indiceId: created.id,
                expedienteId: safeExpedienteId,
                firmaId: firma.id,
                hash,
                totalDocumentos: documentosExpediente.length,
                jsonFile: jsonFile.relativePath,
            },
        });

        return {
            duplicated: false,
            expedienteId: safeExpedienteId,
            firma,
            indice: created,
            indiceJson,
            indiceArchivo: jsonFile,
        };
    },
    async generateForExpediente({ documentoId, usuarioId, actor }) {
        const safeDocumentoId = asInt(documentoId, "documentoId");
        const actorId = actor?.id ?? actor?.usuario_id ?? null;
        const safeUsuarioId = asInt(usuarioId ?? actorId, "usuarioId");

        const documento = await indiceRepo.getDocumentoConExpediente(safeDocumentoId);
        if (!documento) {
            const e = new Error("Documento no encontrado");
            e.code = 404;
            throw e;
        }

        if (!documento.expediente_id) {
            const e = new Error("El documento no pertenece a ningún expediente");
            e.code = 400;
            throw e;
        }

        const documentosExpediente = await indiceRepo.getDocumentosByExpedienteId(documento.expediente_id);

        if (!documentosExpediente.length) {
            const e = new Error("No se encontraron documentos para el expediente");
            e.code = 404;
            throw e;
        }

        const indiceJson = buildExpedienteIndicePayload({
            expedienteId: documento.expediente_id,
            documentos: documentosExpediente,
            actorId,
        });

        const hash = buildObjectHash(indiceJson);

        const existing = await indiceRepo.getIndexByHash(hash);
        if (existing) {
            return {
                duplicated: true,
                expedienteId: documento.expediente_id,
                indice: existing,
                indiceJson,
            };
        }

        const fechaFirma = new Date();

        const firma = await firmaRepo.createFirma({
            documento_id: safeDocumentoId,
            usuario_id: safeUsuarioId,
            fecha: fechaFirma,
        });

        const created = await indiceRepo.createExpedienteIndex({
            hash,
            fecha: new Date(),
            firmaId: firma.id,
            expedienteId: documento.expediente_id,
        });

        const jsonFile = await saveIndiceJsonFile({
            indiceId: created.id,
            expedienteId: documento.expediente_id,
            payload: indiceJson,
        });

        await logAdminAction({
            actorId,
            docId: safeDocumentoId,
            action: "INDICE_EXPEDIENTE_GENERATE",
            result: "OK",
            detail: {
                indiceId: created.id,
                expedienteId: documento.expediente_id,
                firmaId: firma.id,
                hash,
                totalDocumentos: documentosExpediente.length,
                jsonFile: jsonFile.relativePath,
            },
        });

        return {
            duplicated: false,
            expedienteId: documento.expediente_id,
            firma,
            indice: created,
            indiceJson,
            indiceArchivo: jsonFile,
        };
    },
    async generateFromSignedPdf({ documentoId, usuarioId, pdfBuffer, actor }) {
        const safeDocumentoId = asInt(documentoId, "documentoId");
        const actorId = actor?.id ?? actor?.usuario_id ?? null;
        const safeUsuarioId = asInt(usuarioId ?? actorId, "usuarioId");

        if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
            const e = new Error("No se recibió un PDF válido");
            e.code = 400;
            throw e;
        }

        const documento = await indiceRepo.documentoExists(safeDocumentoId);
        if (!documento) {
            const e = new Error("Documento no encontrado");
            e.code = 404;
            throw e;
        }

        const validationResult = {
            valido: true,
            estadoVerificacion: "NO_APLICA",
            mensaje: "Validación de firma digital deshabilitada.",
            firmas: [],
        };

        const hash = buildHash(pdfBuffer);

        const existing = await indiceRepo.getIndexByHash(hash);
        if (existing) {
            return {
                duplicated: true,
                validation: validationResult,
                indice: existing,
                indiceJson: buildIndicePayload({
                    documentoId: safeDocumentoId,
                    firmaId: existing.firma_id,
                    hash,
                    validationResult,
                    actorId,
                }),
            };
        }

        const fechaFirma = getPreferredSignatureDate(validationResult);

        const firma = await firmaRepo.createFirma({
            documento_id: safeDocumentoId,
            usuario_id: safeUsuarioId,
            fecha: fechaFirma,
        });

        const created = await indiceRepo.createIndex({
            hash,
            fecha: new Date(),
            firmaId: firma.id,
        });

        const indiceJson = buildIndicePayload({
            documentoId: safeDocumentoId,
            firmaId: firma.id,
            hash,
            validationResult,
            actorId,
        });

        const jsonFile = await saveIndiceJsonFile({
            indiceId: created.id,
            documentoId: safeDocumentoId,
            payload: indiceJson,
        });

        await logAdminAction({
            actorId,
            docId: safeDocumentoId,
            action: "INDICE_GENERATE",
            result: "OK",
            detail: {
                indiceId: created.id,
                firmaId: firma.id,
                hash,
                totalFirmas: Array.isArray(validationResult?.firmas)
                    ? validationResult.firmas.length
                    : 0,
                jsonFile: jsonFile.relativePath,
            },
        });

        return {
            duplicated: false,
            validation: validationResult,
            firma,
            indice: created,
            indiceJson,
            indiceArchivo: jsonFile,
        };
    },

    async create(indiceData, actor) {
        const firmaId = asInt(indiceData.firmaId, "firmaId");
        const hash = String(indiceData.hash || "").trim();

        if (!hash) {
            const e = new Error("hash inválido");
            e.code = 400;
            throw e;
        }

        const created = await indiceRepo.createIndex({
            hash,
            fecha: indiceData.fecha ? new Date(indiceData.fecha) : new Date(),
            firmaId,
        });

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: created?.documento_id ?? null,
            action: "INDICE_CREATE",
            result: "OK",
            detail: { indiceId: created.id, hash },
        });

        return created;
    },

    async list() {
        return indiceRepo.getAllIndices();
    },

    async getById(id) {
        const indiceId = asInt(id, "id");
        const row = await indiceRepo.getIndexById(indiceId);

        if (!row) {
            const e = new Error("Indice no encontrado");
            e.code = 404;
            throw e;
        }

        return row;
    },

    async listByDocumento(documentoId) {
        const safeDocumentoId = asInt(documentoId, "documentoId");
        return indiceRepo.getIndicesByDocumentoId(safeDocumentoId);
    },

    async update(id, patch, actor) {
        const indiceId = asInt(id, "id");
        const current = await indiceRepo.getIndexById(indiceId);

        if (!current) {
            const e = new Error("Indice no encontrado");
            e.code = 404;
            throw e;
        }

        const updateData = {};

        if (patch.hash !== undefined) updateData.hash = String(patch.hash || "").trim();
        if (patch.fecha !== undefined) updateData.fecha = new Date(patch.fecha);
        if (patch.firmaId !== undefined) updateData.firmaId = asInt(patch.firmaId, "firmaId");

        const updated = await indiceRepo.updateIndex(indiceId, updateData);

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: current.documento_id ?? null,
            action: "INDICE_UPDATE",
            result: "OK",
            detail: { indiceId, patch: updateData },
        });

        return updated;
    },

    async remove(id, actor) {
        const indiceId = asInt(id, "id");
        const current = await indiceRepo.getIndexById(indiceId);

        if (!current) {
            const e = new Error("Indice no encontrado");
            e.code = 404;
            throw e;
        }

        await indiceRepo.removeIndex(indiceId);

        await logAdminAction({
            actorId: actor?.id ?? null,
            docId: current.documento_id ?? null,
            action: "INDICE_DELETE",
            result: "OK",
            detail: { indiceId },
        });

        return true;
    },
};
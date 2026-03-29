// src/services/indice.service.js
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { indiceRepo } from "../repositories/indiceRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

function asInt(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
        const e = new Error(`${name} inválido`);
        e.code = 400;
        throw e;
    }
    return n;
}

function buildObjectHash(obj) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(obj))
        .digest("hex");
}

function buildExpedienteIndicePayload({ expediente, documentos, actorId }) {
    return {
        expediente: {
            id: expediente.id,
            codigo: expediente.codigo,
            nombre: expediente.nombre,
            estado: expediente.estado,
            fechaCreacion: expediente.fecha_creacion,
            fechaCierre: expediente.fecha_cierre ?? null,
            unidadId: expediente.unidad_id,
            serieId: expediente.serie_id,
            subserieId: expediente.subserie_id,
        },
        fechaGeneracion: new Date().toISOString(),
        generadoPor: actorId ?? null,
        algoritmoHash: "sha256",
        totalDocumentos: documentos.length,
        documentos: documentos.map((doc, index) => ({
            orden: index + 1,
            documentoId: doc.id,
            titulo: doc.titulo,
            estado: doc.estado,
            numeroSerie: doc.numero_serie ?? null,
            numeroFirmas: doc.numero_firmas ?? 0,
            firmasObtenidas: doc.firmas_obtenidas ?? 0,
            fecha: doc.fecha ?? null,
            contenidoHash: doc.contenido_hash ?? null,
        })),
    };
}

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

function validarDocumentosParaIndice(documentos) {
    const errores = [];

    for (const doc of documentos) {
        if (!doc.numero_serie) {
            errores.push({
                documentoId: doc.id,
                motivo: "El documento no tiene número de serie/código oficial",
            });
        }

        if (!["APROBADO", "ARCHIVADO"].includes(doc.estado)) {
            errores.push({
                documentoId: doc.id,
                motivo: `Estado no permitido para indexación: ${doc.estado}`,
            });
        }
    }

    return errores;
}

export const indiceService = {
    async cerrarExpediente(expedienteId, actor) {
        const safeExpedienteId = asInt(expedienteId, "expedienteId");
        const actorId = actor?.id ?? actor?.usuario_id ?? null;

        const expediente = await indiceRepo.getExpedienteById(safeExpedienteId);
        if (!expediente) {
            const e = new Error("Expediente no encontrado");
            e.code = 404;
            throw e;
        }

        if (expediente.estado === "CERRADO") {
            const existingClosed = await indiceRepo.getIndexByExpedienteId(safeExpedienteId);
            const e = new Error("El expediente ya se encuentra cerrado");
            e.code = 409;
            e.detail = existingClosed ? { indiceExistente: existingClosed } : null;
            throw e;
        }

        if (["TRANSFERIDO", "ELIMINADO"].includes(expediente.estado)) {
            const e = new Error(
                `No se puede cerrar un expediente en estado ${expediente.estado}`
            );
            e.code = 422;
            throw e;
        }

        const documentosExpediente = await indiceRepo.getDocumentosByExpedienteId(
            safeExpedienteId
        );

        if (!documentosExpediente.length) {
            const e = new Error("No se encontraron documentos para el expediente");
            e.code = 404;
            throw e;
        }

        const erroresValidacion = validarDocumentosParaIndice(documentosExpediente);
        if (erroresValidacion.length) {
            const e = new Error(
                "El expediente no puede cerrarse porque tiene documentos con inconsistencias"
            );
            e.code = 422;
            e.detail = { errores: erroresValidacion };
            throw e;
        }

        const indiceJson = buildExpedienteIndicePayload({
            expediente,
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

        const created = await indiceRepo.createExpedienteIndex({
            hash,
            fecha: new Date(),
            firmaId: null,
            expedienteId: safeExpedienteId,
        });

        const jsonFile = await saveIndiceJsonFile({
            indiceId: created.id,
            expedienteId: safeExpedienteId,
            payload: indiceJson,
        });

        await indiceRepo.closeExpediente(safeExpedienteId);

        await logAdminAction({
            actorId,
            docId: null,
            action: "EXPEDIENTE_CLOSE_INDEX_GENERATE",
            result: "OK",
            detail: {
                indiceId: created.id,
                expedienteId: safeExpedienteId,
                hash,
                totalDocumentos: documentosExpediente.length,
                jsonFile: jsonFile.relativePath,
            },
        });

        return {
            duplicated: false,
            expedienteId: safeExpedienteId,
            indice: created,
            indiceJson,
            indiceArchivo: jsonFile,
        };
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

    async getByExpedienteId(expedienteId) {
        const safeExpedienteId = asInt(expedienteId, "expedienteId");
        const row = await indiceRepo.getIndexByExpedienteId(safeExpedienteId);

        if (!row) {
            const e = new Error("No se encontró índice para el expediente");
            e.code = 404;
            throw e;
        }

        return row;
    },

    async listByExpedienteId(expedienteId) {
        const safeExpedienteId = asInt(expedienteId, "expedienteId");
        return indiceRepo.getIndicesByExpedienteId(safeExpedienteId);
    },
};
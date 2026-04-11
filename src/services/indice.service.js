// src/services/indice.service.js
import crypto from "crypto";
import fs from "fs";
import path from "path";
//npm install docx
import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
    ShadingType,
    VerticalAlign,
    ImageRun,
} from "docx";

import { indiceRepo } from "../repositories/indiceRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";

function pxFont(size) {
    return size * 2;
}

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
            unidadNombre: expediente.unidad_nombre ?? null,
            serieId: expediente.serie_id,
            serieNombre: expediente.serie_nombre ?? null,
            subserieId: expediente.subserie_id,
            subserieNombre: expediente.subserie_nombre ?? null,
        },
        fechaGeneracion: new Date().toISOString(),
        generadoPor: actorId ?? null,
        algoritmoHash: "sha256",
        totalDocumentos: documentos.length,
        documentos: documentos.map((doc, index) => ({
            orden: index + 1,
            documentoId: doc.id,
            nombre: doc.numero_serie ?? null,
            titulo: doc.titulo,
            estado: doc.estado,
            numeroSerie: doc.numero_serie ?? null,
            numeroFirmas: doc.numero_firmas ?? 0,
            firmasObtenidas: doc.firmas_obtenidas ?? 0,
            fechaDocumento: doc.fecha ?? null,
            fechaIncorporacion: doc.fecha_incorporacion ?? null,
            contenidoHash: doc.contenido_hash ?? null,
            tamanoArchivo: null,
        })),
    };
}
function buildActaCierrePayload({ expediente, documentos, indiceId }) {
    const anio = new Date().getFullYear();

    return {
        codigoActa: `ACT MNCR-DAF-AC-${indiceId}-${anio}`,
        fondo: "Museo Nacional de Costa Rica",
        subfondo: expediente.unidad_nombre ?? expediente.unidadNombre ?? "",
        serie: expediente.serie_nombre ?? expediente.serieNombre ?? "",
        subserie: expediente.subserie_nombre ?? expediente.subserieNombre ?? "",
        expediente: expediente.nombre ?? "",
        fechaCierre: expediente.fecha_cierre ?? expediente.fechaCierre ?? null,
        cantidadArchivos: documentos.length,
        documentos: documentos.map((doc, index) => ({
            orden: index + 1,
            nombre: doc.nombre ?? doc.numeroSerie ?? doc.numero_serie ?? "",
            titulo: doc.titulo ?? "",
            fechaDocumento: doc.fechaDocumento ?? doc.fecha ?? null,
            fechaIncorporacion: doc.fechaIncorporacion ?? doc.fecha_incorporacion ?? null,
            hash: doc.contenidoHash ?? doc.contenido_hash ?? null,
            tamanoArchivo: doc.tamanoArchivo ?? null,
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

async function saveActaCierreDocxFile({ indiceId, expedienteId, payload }) {

    const indicesDir = path.resolve(process.cwd(), "uploads", "indices");
    await fs.promises.mkdir(indicesDir, { recursive: true });

    const border = {
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    };
    const logoPath = path.resolve(process.cwd(), "src", "assets", "logo-mncr.jpg");
    const logoExists = fs.existsSync(logoPath);
    const logoBuffer = logoExists ? await fs.promises.readFile(logoPath) : null;

    const safeDocs = (payload.documentos || []).map((doc) => ({
        nombre: doc.nombre || "",
        titulo: doc.titulo || "",
        fechaDocumento: formatFecha(doc.fechaDocumento),
        fechaIncorporacion: formatFecha(doc.fechaIncorporacion),
        hash: splitTextEvery(doc.hash || "", 16),
        tamanoArchivo: doc.tamanoArchivo || "No disponible",
    }));

    const infoTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: border,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Fondo: ", bold: true, size: pxFont(10) }),
                                    new TextRun({ text: payload.fondo || "", size: pxFont(10) }),
                                ],
                            }),
                        ],
                    }),
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: border,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Subfondo: ", bold: true, size: pxFont(10) }),
                                    new TextRun({ text: payload.subfondo || "", size: pxFont(10) }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: border,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Serie: ", bold: true, size: pxFont(10) }),
                                    new TextRun({ text: payload.serie || "", size: pxFont(10) }),
                                ],
                            }),
                        ],
                    }),
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: border,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Subserie: ", bold: true, size: pxFont(10) }),
                                    new TextRun({ text: payload.subserie || "", size: pxFont(10) }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            new TableRow({
                children: [
                    new TableCell({
                        columnSpan: 2,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: border,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Expediente: ", bold: true, size: pxFont(10) }),
                                    new TextRun({ text: payload.expediente || "", size: pxFont(10) }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            new TableRow({
                children: [
                    new TableCell({
                        columnSpan: 2,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: border,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "Fecha de cierre del expediente: ",
                                        bold: true,
                                        size: pxFont(10),
                                    }),
                                    new TextRun({
                                        text: formatFecha(payload.fechaCierre),
                                        size: pxFont(10),
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            new TableRow({
                children: [
                    new TableCell({
                        columnSpan: 2,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: border,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "Cantidad de archivos: ",
                                        bold: true,
                                        size: pxFont(10),
                                    }),
                                    new TextRun({
                                        text: String(payload.cantidadArchivos ?? 0),
                                        size: pxFont(10),
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });

    const docsTableRows = [
        new TableRow({
            children: [
                new TableCell({
                    width: { size: 14, type: WidthType.PERCENTAGE },
                    borders: border,
                    shading: {
                        type: ShadingType.CLEAR,
                        color: "auto",
                        fill: "D9E2F3",
                    },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: "Nombre", bold: true, size: pxFont(9) })],
                        }),
                    ],
                }),
                new TableCell({
                    width: { size: 22, type: WidthType.PERCENTAGE },
                    borders: border,
                    shading: {
                        type: ShadingType.CLEAR,
                        color: "auto",
                        fill: "D9E2F3",
                    },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: "Título", bold: true, size: pxFont(9) })],
                        }),
                    ],
                }),
                new TableCell({
                    width: { size: 12, type: WidthType.PERCENTAGE },
                    borders: border,
                    shading: {
                        type: ShadingType.CLEAR,
                        color: "auto",
                        fill: "D9E2F3",
                    },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    text: "Fecha del documento",
                                    bold: true,
                                    size: pxFont(9),
                                }),
                            ],
                        }),
                    ],
                }),
                new TableCell({
                    width: { size: 12, type: WidthType.PERCENTAGE },
                    borders: border,
                    shading: {
                        type: ShadingType.CLEAR,
                        color: "auto",
                        fill: "D9E2F3",
                    },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    text: "Fecha de incorporación",
                                    bold: true,
                                    size: pxFont(9),
                                }),
                            ],
                        }),
                    ],
                }),
                new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: border,
                    shading: {
                        type: ShadingType.CLEAR,
                        color: "auto",
                        fill: "D9E2F3",
                    },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: "HASH", bold: true, size: pxFont(9) })],
                        }),
                    ],
                }),
                new TableCell({
                    width: { size: 10, type: WidthType.PERCENTAGE },
                    borders: border,
                    shading: {
                        type: ShadingType.CLEAR,
                        color: "auto",
                        fill: "D9E2F3",
                    },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    text: "Tamaño de archivo",
                                    bold: true,
                                    size: pxFont(9),
                                }),
                            ],
                        }),
                    ],
                }),
            ],
        }),
        ...safeDocs.map(
            (doc) =>
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 16, type: WidthType.PERCENTAGE },
                            borders: border,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: doc.nombre, size: pxFont(9) })],
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: 24, type: WidthType.PERCENTAGE },
                            borders: border,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: doc.titulo, size: pxFont(9) })],
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            borders: border,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new TextRun({ text: doc.fechaDocumento, size: pxFont(9) }),
                                    ],
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            borders: border,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new TextRun({
                                            text: doc.fechaIncorporacion,
                                            size: pxFont(9),
                                        }),
                                    ],
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: 30, type: WidthType.PERCENTAGE },
                            borders: border,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                                new Paragraph({
                                    children: splitTextEvery(doc.hash, 16)
                                        .split("\n")
                                        .flatMap((line, index) =>
                                            index === 0
                                                ? [new TextRun({ text: line, size: pxFont(7) })]
                                                : [new TextRun({ break: 1 }), new TextRun({ text: line, size: pxFont(7) })]
                                        ),
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            borders: border,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new TextRun({ text: doc.tamanoArchivo, size: pxFont(9) }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                }),
        ),
    ];

    const docsTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: docsTableRows,
    });

    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 1000,
                            right: 900,
                            bottom: 1000,
                            left: 900,
                        },
                    },
                },
                children: [
                    ...(logoBuffer
                        ? [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 180 },
                                children: [
                                    new ImageRun({
                                        data: logoBuffer,
                                        type: "jpg",
                                        transformation: {
                                            width: 600,
                                            height: 90,
                                        },
                                    }),
                                ],
                            }),
                        ]
                        : []),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 120 },
                        children: [
                            new TextRun({
                                text: "MUSEO NACIONAL DE COSTA RICA",
                                bold: true,
                                size: pxFont(13),
                            }),
                        ],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 80 },
                        children: [
                            new TextRun({
                                text: "DEPARTAMENTO DE ADMINISTRACIÓN Y FINANZAS",
                                bold: true,
                                size: pxFont(11),
                            }),
                        ],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 260 },
                        children: [
                            new TextRun({
                                text: "ARCHIVO CENTRAL",
                                bold: true,
                                size: pxFont(11),
                            }),
                        ],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 140 },
                        children: [
                            new TextRun({
                                text: payload.codigoActa || "",
                                bold: true,
                                size: pxFont(12),
                            }),
                        ],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 280 },
                        children: [
                            new TextRun({
                                text: "ACTA DE CIERRE DE EXPEDIENTE",
                                bold: true,
                                size: pxFont(14),
                            }),
                        ],
                    }),
                    new Paragraph({
                        spacing: { after: 260 },
                        alignment: AlignmentType.JUSTIFIED,
                        children: [
                            new TextRun({
                                text: "Se procede a efectuar el cierre del expediente que se señala a continuación, con los documentos que contiene la lista adjunta.",
                                size: pxFont(10),
                            }),
                        ],
                    }),
                    infoTable,
                    new Paragraph({
                        spacing: { before: 300, after: 180 },
                        children: [
                            new TextRun({
                                text: "Lista de documentos:",
                                bold: true,
                                size: pxFont(10),
                            }),
                        ],
                    }),
                    docsTable,
                    new Paragraph({
                        spacing: { before: 280, after: 220 },
                        alignment: AlignmentType.JUSTIFIED,
                        children: [
                            new TextRun({
                                text: "El responsable de emitir este documento que representa la integridad del expediente custodiado en el Archivo Digital Institucional es el Archivo Central.",
                                size: pxFont(10),
                            }),
                        ],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 500, after: 80 },
                        children: [
                            new TextRun({
                                text: "__________________________________",
                                size: pxFont(10),
                            }),
                        ],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({
                                text: "Coordinadora Archivo Central",
                                bold: true,
                                size: pxFont(10),
                            }),
                        ],
                    }),
                ],
            },
        ],
    });

    const buffer = await Packer.toBuffer(doc);

    const fileName = `acta-cierre-expediente-${expedienteId}-${indiceId}.docx`;
    const filePath = path.join(indicesDir, fileName);

    await fs.promises.writeFile(filePath, buffer);

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

function splitTextEvery(value, chunkSize = 16) {
    const text = String(value || "");
    if (!text) return "";

    const parts = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        parts.push(text.slice(i, i + chunkSize));
    }
    return parts.join("\n");
}
function formatFecha(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("es-CR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
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
        const fechaCierre = new Date().toISOString();

        const expedienteParaIndice = {
            ...expediente,
            estado: "CERRADO",
            fecha_cierre: fechaCierre,
        };

        const indiceJson = buildExpedienteIndicePayload({
            expediente: expedienteParaIndice,
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

        const actaPayload = buildActaCierrePayload({
            expediente: expedienteParaIndice,
            documentos: indiceJson.documentos,
            indiceId: created.id,
        });

        const jsonFile = await saveIndiceJsonFile({
            indiceId: created.id,
            expedienteId: safeExpedienteId,
            payload: indiceJson,
        });
        const actaFile = await saveActaCierreDocxFile({

            indiceId: created.id,
            expedienteId: safeExpedienteId,
            payload: actaPayload,

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

        /*return {
            duplicated: false,
            expedienteId: safeExpedienteId,
            indice: created,
            indiceJson,
            indiceArchivo: jsonFile,
        };*/
        return {
            duplicated: false,
            expedienteId: safeExpedienteId,
            indice: created,
            indiceJson,
            actaPayload,
            indiceArchivo: jsonFile,
            actaArchivo: actaFile,
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
// src/utils/expedienteActaEliminacionPdf.js
// Genera actas en Word (.docx) conservando la plantilla oficial (OOXML nativo).
import fs from "fs";
import path from "path";
import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
} from "docx";
import { buildActaDocxBufferFromMuseumTemplate } from "./expedienteActaDocxNativo.js";
import { uploadsPath } from "./uploads.js";
/**
 * Guarda el acta de eliminación como .docx bajo uploads/disposicion-eliminacion/
 * (plantilla: src/assets/actas/plantilla-acta-eliminacion.docx).
 */
export async function saveActaEliminacionDocx({ expedienteId, codigoActa, payload }) {
    const filas = Array.isArray(payload?.filas_tabla) ? payload.filas_tabla : [];
    const archivistaNombre = String(payload?.archivistaNombre ?? "—").trim() || "—";
    const detalleDisposicion = payload?.eliminacion_detalle ?? null;

    const buffer = buildActaDocxBufferFromMuseumTemplate({
        templateFileName: "plantilla-acta-eliminacion.docx",
        codigoActa,
        archivistaNombre,
        filas,
        tipo: "eliminacion",
        detalleDisposicion,
    });

    return writeActaDocxToUploads({
        expedienteId,
        subdir: "disposicion-eliminacion",
        prefix: "acta-eliminacion",
        buffer,
    });
}

async function writeActaDocxToUploads({ expedienteId, subdir, prefix, buffer }) {
    const dir = uploadsPath(subdir);
    await fs.promises.mkdir(dir, { recursive: true });

    const safeId = Number(expedienteId);
    const fileName = `${prefix}-expediente-${safeId}-${Date.now()}.docx`;
    const filePath = path.join(dir, fileName);
    await fs.promises.writeFile(filePath, buffer);

    return {
        fileName,
        filePath,
        relativePath: `uploads/${subdir}/${fileName}`,
    };
}

/** Buffer .docx para empaquetar en el ZIP (plantilla de transferencia). */
export async function buildActaTransferenciaDocxBuffer({ codigoActa, payload }) {
    const filas = Array.isArray(payload?.filas_tabla) ? payload.filas_tabla : [];
    const archivistaNombre = String(payload?.archivistaNombre ?? "—").trim() || "—";
    const transferenciaDetalle = payload?.transferencia_detalle ?? null;
   /* return buildActaDocxBufferFromMuseumTemplate({
        templateFileName: "plantilla-acta-transferencia.docx",
        codigoActa,
        archivistaNombre,
        filas,
        tipo: "transferencia",
        detalleDisposicion: transferenciaDetalle,*/
    try {
        return buildActaDocxBufferFromMuseumTemplate({
            templateFileName: "plantilla-acta-transferencia.docx",
            codigoActa,
            archivistaNombre,
            filas,
            tipo: "transferencia",
            detalleDisposicion: transferenciaDetalle,
        });
    } catch (error) {
        const missingTemplate = /Plantilla de acta no encontrada/i.test(
            String(error?.message || "")
        );
        if (!missingTemplate) throw error;
        console.warn(
            "[acta-transferencia] Plantilla no encontrada, usando fallback DOCX básico."
        );
        return buildTransferFallbackDocxBuffer({
            codigoActa,
            archivistaNombre,
            filas,
            transferenciaDetalle,
        });
    }
}

async function buildTransferFallbackDocxBuffer({
                                                   codigoActa,
                                                   archivistaNombre,
                                                   filas,
                                                   transferenciaDetalle,
                                               }) {
    const safe = (v) => String(v ?? "—").trim() || "—";
    const rows = Array.isArray(filas) ? filas : [];

    const headerRow = new TableRow({
        children: [
            "Serie",
            "Subserie",
            "Expediente",
            "Nombre",
            "Titulo",
            "Fecha",
            "Vigencia",
            "Acceso",
            "Tamano",
        ].map(
            (h) =>
                new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                })
        ),
    });
    const dataRows = rows.map(
        (r) =>
            new TableRow({
                children: [
                    r.serie_documental,
                    r.subserie,
                    r.expediente,
                    r.nombre,
                    r.titulo,
                    r.fecha_documento,
                    r.vigencia_definida,
                    r.condiciones_acceso,
                    r.tamano_archivo,
                ].map((val) => new TableCell({ children: [new Paragraph(safe(val))] })),
            })
    );

    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
    });

    const doc = new Document({
        sections: [
            {
                children: [
                    new Paragraph({
                        children: [new TextRun({ text: "ACTA DE TRANSFERENCIA", bold: true })],
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: `Codigo: ${safe(codigoActa)}` })],
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: `Archivista: ${safe(archivistaNombre)}` })],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Destino: ${safe(
                                    transferenciaDetalle?.destino_transferencia
                                )}`,
                            }),
                        ],
                    }),
                    new Paragraph(""),
                    table,
                ],
            },
        ],
    });

    return Packer.toBuffer(doc);
}

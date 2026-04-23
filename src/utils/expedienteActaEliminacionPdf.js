// src/utils/expedienteActaEliminacionPdf.js
// Genera actas en Word (.docx) conservando la plantilla oficial (OOXML nativo).
import fs from "fs";
import path from "path";

import { buildActaDocxBufferFromMuseumTemplate } from "./expedienteActaDocxNativo.js";

/**
 * Guarda el acta de eliminación como .docx bajo uploads/disposicion-eliminacion/
 * (plantilla: src/assets/actas/plantilla-acta-eliminacion.docx).
 */
export async function saveActaEliminacionDocx({ expedienteId, codigoActa, payload }) {
    const filas = Array.isArray(payload?.filas_tabla) ? payload.filas_tabla : [];
    const archivistaNombre = String(payload?.archivistaNombre ?? "—").trim() || "—";

    const buffer = buildActaDocxBufferFromMuseumTemplate({
        templateFileName: "plantilla-acta-eliminacion.docx",
        codigoActa,
        archivistaNombre,
        filas,
        tipo: "eliminacion",
    });

    return writeActaDocxToUploads({
        expedienteId,
        subdir: "disposicion-eliminacion",
        prefix: "acta-eliminacion",
        buffer,
    });
}

async function writeActaDocxToUploads({ expedienteId, subdir, prefix, buffer }) {
    const dir = path.resolve(process.cwd(), "uploads", subdir);
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
    return buildActaDocxBufferFromMuseumTemplate({
        templateFileName: "plantilla-acta-transferencia.docx",
        codigoActa,
        archivistaNombre,
        filas,
        tipo: "transferencia",
    });
}

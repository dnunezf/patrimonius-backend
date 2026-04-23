// src/utils/expedienteActaDocxNativo.js
// Rellena la plantilla .docx del museo editando word/document.xml (conserva encabezados, logos, estilos).
import fs from "fs";
import path from "path";
import PizZip from "pizzip";

import { breakLongTokenForWrap } from "./expedienteActaHtmlDesdePlantilla.js";

const ACTAS_DIR = path.join(process.cwd(), "src", "assets", "actas");

function escapeXml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function extractTrs(tableXml) {
    const rows = [];
    let pos = 0;
    while (pos < tableXml.length) {
        const open = tableXml.indexOf("<w:tr", pos);
        if (open === -1) break;
        const close = tableXml.indexOf("</w:tr>", open);
        if (close === -1) break;
        rows.push(tableXml.slice(open, close + 7));
        pos = close + 7;
    }
    return rows;
}

function splitCells(rowXml) {
    const cells = [];
    let pos = 0;
    while (pos < rowXml.length) {
        const open = rowXml.indexOf("<w:tc>", pos);
        if (open === -1) break;
        const close = rowXml.indexOf("</w:tc>", open);
        if (close === -1) break;
        cells.push(rowXml.slice(open, close + 7));
        pos = close + 7;
    }
    return cells;
}

/**
 * Inserta texto en la primera celda vacía (párrafo sin runs) de la plantilla.
 */
function fillEmptyTableCell(cellXml, value, { isHash = false } = {}) {
    let t = value == null || String(value).trim() === "" ? "—" : String(value).trim();
    if (isHash) {
        t = breakLongTokenForWrap(t, 8);
    }
    const inner = escapeXml(t);
    const injected = `</w:pPr><w:r><w:t xml:space="preserve">${inner}</w:t></w:r></w:p>`;
    if (/\s*<\/w:pPr>\s*<\/w:p>/.test(cellXml)) {
        return cellXml.replace(/\s*<\/w:pPr>\s*<\/w:p>/, injected);
    }
    return cellXml.replace(/<\/w:tc>\s*$/i, `<w:p><w:r><w:t xml:space="preserve">${inner}</w:t></w:r></w:p></w:tc>`);
}

function buildFilledRow(templateRowXml, values, { hashColIndex = -1 } = {}) {
    const openEnd = templateRowXml.indexOf(">") + 1;
    const openTag = templateRowXml.slice(0, openEnd);
    const cells = splitCells(templateRowXml);
    if (cells.length !== values.length) {
        const e = new Error(
            `La fila de datos de la plantilla tiene ${cells.length} celdas; se enviaron ${values.length} valores`
        );
        e.status = 500;
        throw e;
    }
    const filled = cells.map((c, i) =>
        fillEmptyTableCell(c, values[i], { isHash: i === hashColIndex })
    );
    return `${openTag}${filled.join("")}</w:tr>`;
}

function countCellsInRow(rowXml) {
    return splitCells(rowXml).length;
}

/** Localiza la tabla de detalle (cabecera + fila vacía) por marcadores y número de columnas. */
function findMainSerieTable(documentXml, { expectedCells } = {}) {
    let idx = 0;
    while (idx < documentXml.length) {
        const s = documentXml.indexOf("<w:tbl>", idx);
        if (s === -1) return null;
        const e = documentXml.indexOf("</w:tbl>", s);
        if (e === -1) return null;
        const tbl = documentXml.slice(s, e + 8);
        const hasSerie =
            tbl.includes("Serie Documental") ||
            (tbl.includes("Serie") && tbl.includes("Documental"));
        const hasSubserie = tbl.includes("Subserie documental");
        if (!hasSerie || !hasSubserie) {
            idx = s + 7;
            continue;
        }
        const rows = extractTrs(tbl);
        if (rows.length < 2) {
            idx = s + 7;
            continue;
        }
        if (expectedCells != null && countCellsInRow(rows[1]) !== expectedCells) {
            idx = s + 7;
            continue;
        }
        return { start: s, end: e + 8, tbl, rows };
    }
    return null;
}

function replacePlaceholderRowsInTable(tableXml, placeholderRow, newRowsJoined) {
    const pos = tableXml.indexOf(placeholderRow);
    if (pos === -1) {
        const e = new Error("No se encontró la fila vacía de datos en la tabla del acta");
        e.status = 500;
        throw e;
    }
    return tableXml.slice(0, pos) + newRowsJoined + tableXml.slice(pos + placeholderRow.length);
}

/** Reemplazo del código ACT cuando Word lo fragmentó en varios <w:t>. */
function replaceActaCodigoSplitRuns(documentXml, codigoActa) {
    const re =
        /<w:t>ACT MNCR-DAF-AC-<\/w:t><\/w:r><w:r[^>]*>[\s\S]*?<w:t>XXX<\/w:t><\/w:r><w:r[^>]*>[\s\S]*?<w:t>-202<\/w:t><\/w:r><w:r[^>]*>[\s\S]*?<w:t>X<\/w:t><\/w:r>/;
    if (re.test(documentXml)) {
        return documentXml.replace(
            re,
            `<w:t xml:space="preserve">${escapeXml(codigoActa)}</w:t></w:r>`
        );
    }
    const simple = "ACT MNCR-DAF-AC-XXX-202X";
    if (documentXml.includes(simple)) {
        return documentXml.replaceAll(simple, escapeXml(codigoActa));
    }
    return documentXml;
}

function replaceArchivistaEliminacion(documentXml, nombre) {
    const label = `${escapeXml(nombre)} (archivista en el sistema)`;
    return documentXml.replace(
        /<w:t>XXXXXXXXXXXXXXXXXXXXXXX<\/w:t>/,
        `<w:t xml:space="preserve">${label}</w:t>`
    );
}

function replaceArchivistaTransferencia(documentXml, nombre) {
    const label = `${escapeXml(nombre)} (archivista en el sistema)`;
    return documentXml.replace(
        /<w:t>\(Nombre del rol del archivista en el sistema\)<\/w:t>/,
        `<w:t xml:space="preserve">${label}</w:t>`
    );
}

function readTemplateBuffer(templateFileName) {
    const abs = path.join(ACTAS_DIR, templateFileName);
    if (!fs.existsSync(abs)) {
        const e = new Error(`Plantilla de acta no encontrada: ${templateFileName}`);
        e.status = 500;
        throw e;
    }
    return fs.readFileSync(abs);
}

/**
 * @param {object} opts
 * @param {string} opts.templateFileName
 * @param {string} opts.codigoActa
 * @param {string} opts.archivistaNombre
 * @param {Array<object>} opts.filas — mismas claves que recolectarFilasActa
 * @param {'eliminacion'|'transferencia'} opts.tipo
 */
export function buildActaDocxBufferFromMuseumTemplate({
    templateFileName,
    codigoActa,
    archivistaNombre,
    filas,
    tipo,
}) {
    const zip = new PizZip(readTemplateBuffer(templateFileName));
    const entry = zip.file("word/document.xml");
    if (!entry) {
        const e = new Error("Plantilla inválida: falta word/document.xml");
        e.status = 500;
        throw e;
    }
    let xml = entry.asText();

    xml = replaceActaCodigoSplitRuns(xml, codigoActa);
    if (tipo === "eliminacion") {
        xml = replaceArchivistaEliminacion(xml, archivistaNombre);
    } else {
        xml = replaceArchivistaTransferencia(xml, archivistaNombre);
    }

    const expectedCells = tipo === "eliminacion" ? 8 : 9;
    const found = findMainSerieTable(xml, { expectedCells });
    if (!found || found.rows.length < 2) {
        const e = new Error("No se localizó la tabla de detalle en la plantilla del acta");
        e.status = 500;
        throw e;
    }

    const [, placeholderRow] = found.rows;
    const list = Array.isArray(filas) ? filas : [];

    let newRows;
    if (tipo === "eliminacion") {
        newRows = list
            .map((r) =>
                buildFilledRow(
                    placeholderRow,
                    [
                        r.serie_documental,
                        r.subserie,
                        r.expediente,
                        r.nombre,
                        r.titulo,
                        r.fecha_documento,
                        r.hash,
                        r.tamano_archivo,
                    ],
                    { hashColIndex: 6 }
                )
            )
            .join("");
    } else {
        newRows = list
            .map((r) =>
                buildFilledRow(placeholderRow, [
                    r.serie_documental,
                    r.subserie,
                    r.expediente,
                    r.nombre,
                    r.titulo,
                    r.fecha_documento,
                    r.vigencia_definida,
                    r.condiciones_acceso,
                    r.tamano_archivo,
                ])
            )
            .join("");
    }

    const updatedTable = replacePlaceholderRowsInTable(found.tbl, placeholderRow, newRows);
    xml = xml.slice(0, found.start) + updatedTable + xml.slice(found.end);

    zip.file("word/document.xml", xml);
    return zip.generate({ type: "nodebuffer" });
}

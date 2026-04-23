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

/** Texto en un solo párrafo OOXML (sin saltos problemáticos en &lt;w:t&gt;). */
function normalizeDetalleTexto(s) {
    return String(s ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function textoOEmDash(s) {
    const t = normalizeDetalleTexto(s);
    return t === "" ? "—" : t;
}

function checklistSiNo(v) {
    if (v === true || v === 1 || String(v).toLowerCase() === "true") return "Sí";
    if (v === false || v === 0 || String(v).toLowerCase() === "false") return "No";
    return "—";
}

/** Párrafo cuerpo Verdana ~11 pt, alineado justificado (como el acta). */
const OOXML_PPR_CUERPO =
    "<w:pPr><w:widowControl/><w:suppressAutoHyphens w:val=\"0\"/><w:jc w:val=\"both\"/>" +
    "<w:rPr><w:rFonts w:ascii=\"Verdana\" w:hAnsi=\"Verdana\" w:cs=\"Calibri\"/>" +
    "<w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/><w:lang w:val=\"es-CR\"/></w:rPr></w:pPr>";

const OOXML_RPR_CUERPO =
    "<w:rPr><w:rFonts w:ascii=\"Verdana\" w:hAnsi=\"Verdana\" w:cs=\"Calibri\"/>" +
    "<w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/><w:lang w:val=\"es-CR\"/></w:rPr>";

function ooxmlParrafoUnaCarrera(texto, { negrita = false } = {}) {
    const t = escapeXml(textoOEmDash(texto));
    const b = negrita ? "<w:b/><w:bCs/>" : "";
    return `<w:p>${OOXML_PPR_CUERPO}<w:r>${OOXML_RPR_CUERPO}${b}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
}

/** Bordes de celda como la tabla de expediente de la plantilla (línea negra fina). */
const OOXML_TC_BORDERS =
    "<w:tcBorders>" +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    "</w:tcBorders>";

const OOXML_TC_MAR =
    "<w:tcMar>" +
    '<w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>' +
    "</w:tcMar>";

/** Párrafo dentro de celda de tabla (misma fuente/tamaño que cabecera de expediente en plantilla: Verdana 10 pt). */
function ooxmlParrafoEnCeldaTabla(texto, { negrita = false, centrado = false } = {}) {
    const jc = centrado ? "center" : "both";
    const b = negrita ? "<w:b/><w:bCs/>" : "";
    const t = escapeXml(textoOEmDash(texto));
    return (
        `<w:p><w:pPr><w:widowControl/><w:suppressAutoHyphens w:val="0"/><w:jc w:val="${jc}"/>` +
        '<w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Calibri"/>' +
        '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CR"/></w:rPr></w:pPr>' +
        `<w:r><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Calibri"/>${b}` +
        '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CR"/></w:rPr>' +
        `<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
    );
}

function ooxmlCeldaTablaDosColumnas(anchoPct, contenidoParrafoXml, { gridSpan = null } = {}) {
    const span = gridSpan != null ? `<w:gridSpan w:val="${gridSpan}"/>` : "";
    return (
        `<w:tc><w:tcPr><w:tcW w:w="${anchoPct}" w:type="pct"/>${span}${OOXML_TC_BORDERS}${OOXML_TC_MAR}</w:tcPr>${contenidoParrafoXml}</w:tc>`
    );
}

function ooxmlFilaDosCeldas(anchoIzqPct, anchoDerPct, textoIzq, textoDer, optsIzq = {}, optsDer = {}) {
    const pIzq = ooxmlParrafoEnCeldaTabla(textoIzq, optsIzq);
    const pDer = ooxmlParrafoEnCeldaTabla(textoDer, optsDer);
    return (
        "<w:tr>" +
        ooxmlCeldaTablaDosColumnas(anchoIzqPct, pIzq) +
        ooxmlCeldaTablaDosColumnas(anchoDerPct, pDer) +
        "</w:tr>"
    );
}

function ooxmlFilaTituloChecklist(texto) {
    const p = ooxmlParrafoEnCeldaTabla(texto, { negrita: true, centrado: true });
    return (
        "<w:tr>" +
        ooxmlCeldaTablaDosColumnas(5000, p, { gridSpan: 2 }) +
        "</w:tr>"
    );
}

/**
 * Tabla 2 columnas (Concepto | Detalle) al estilo de la tabla de expediente de la plantilla.
 */
function buildTablaJustificacionTransferenciaOoxml(detalle) {
    const destino = detalle.destino_transferencia;
    const jIni = detalle.justificacion_inicio;
    const jApr = detalle.justificacion_aprobacion;
    const rev = detalle.revision && typeof detalle.revision === "object" ? detalle.revision : {};
    const ch =
        rev.checklist && typeof rev.checklist === "object"
            ? rev.checklist
            : rev.metadatos_ok != null || rev.firma_ok != null
              ? rev
              : null;

    const tblPr =
        "<w:tblPr>" +
        '<w:tblW w:w="5000" w:type="pct"/>' +
        "<w:tblCellMar>" +
        '<w:top w:w="15" w:type="dxa"/><w:left w:w="15" w:type="dxa"/><w:bottom w:w="15" w:type="dxa"/><w:right w:w="15" w:type="dxa"/>' +
        "</w:tblCellMar>" +
        '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
        "</w:tblPr>";
    const tblGrid = "<w:tblGrid><w:gridCol w:w=\"4000\"/><w:gridCol w:w=\"10000\"/></w:tblGrid>";

    const wConcepto = 1967;
    const wDetalle = 3033;

    const filas = [];
    filas.push(
        ooxmlFilaDosCeldas(wConcepto, wDetalle, "Concepto", "Detalle", { negrita: true, centrado: true }, {
            negrita: true,
            centrado: true,
        })
    );
    filas.push(
        ooxmlFilaDosCeldas(wConcepto, wDetalle, "Destino de la transferencia", destino, { negrita: true }, {})
    );
    filas.push(
        ooxmlFilaDosCeldas(wConcepto, wDetalle, "Justificación al inicio del trámite", jIni, { negrita: true }, {})
    );
    filas.push(
        ooxmlFilaDosCeldas(wConcepto, wDetalle, "Justificación de aprobación y ejecución", jApr, { negrita: true }, {})
    );

    if (ch) {
        filas.push(ooxmlFilaTituloChecklist("Revisión obligatoria (checklist)"));
        filas.push(
            ooxmlFilaDosCeldas(wConcepto, wDetalle, "Metadatos completos", checklistSiNo(ch.metadatos_ok), {
                negrita: true,
            }, {})
        );
        filas.push(
            ooxmlFilaDosCeldas(wConcepto, wDetalle, "Firma digital", checklistSiNo(ch.firma_ok), { negrita: true }, {})
        );
        filas.push(
            ooxmlFilaDosCeldas(wConcepto, wDetalle, "Plazo de conservación", checklistSiNo(ch.plazo_ok), {
                negrita: true,
            }, {})
        );
        filas.push(
            ooxmlFilaDosCeldas(wConcepto, wDetalle, "Política de disposición", checklistSiNo(ch.politica_ok), {
                negrita: true,
            }, {})
        );
        if (ch.notas != null && String(ch.notas).trim() !== "") {
            filas.push(
                ooxmlFilaDosCeldas(wConcepto, wDetalle, "Notas de la revisión", ch.notas, { negrita: true }, {})
            );
        }
    }

    return `<w:tbl>${tblPr}${tblGrid}${filas.join("")}</w:tbl>`;
}

/**
 * Inserta título + tabla de detalle de transferencia antes de «Dando testimonio de lo anterior,».
 */
function insertTransferenciaDetalleBloque(documentXml, detalle) {
    if (!detalle || typeof detalle !== "object") {
        return documentXml;
    }

    const titulo = ooxmlParrafoUnaCarrera("Detalle de la disposición (transferencia)", { negrita: true });
    const tabla = buildTablaJustificacionTransferenciaOoxml(detalle);
    const insercion = titulo + tabla;
    const anchor = "<w:t>Dando testimonio de lo anterior,</w:t>";
    const ix = documentXml.indexOf(anchor);
    if (ix === -1) {
        const bodyEnd = documentXml.indexOf("</w:body>");
        if (bodyEnd === -1) {
            return documentXml;
        }
        return documentXml.slice(0, bodyEnd) + insercion + documentXml.slice(bodyEnd);
    }
    const pStart = documentXml.lastIndexOf("<w:p ", ix);
    if (pStart === -1) {
        return documentXml;
    }
    return documentXml.slice(0, pStart) + insercion + documentXml.slice(pStart);
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
 * @param {object} [opts.transferenciaDetalle] — solo transferencia: destino, justificaciones, checklist
 */
export function buildActaDocxBufferFromMuseumTemplate({
    templateFileName,
    codigoActa,
    archivistaNombre,
    filas,
    tipo,
    transferenciaDetalle = null,
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
        if (transferenciaDetalle) {
            xml = insertTransferenciaDetalleBloque(xml, transferenciaDetalle);
        }
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

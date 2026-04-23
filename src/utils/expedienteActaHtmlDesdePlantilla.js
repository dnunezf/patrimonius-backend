// src/utils/expedienteActaHtmlDesdePlantilla.js
import fs from "fs";
import path from "path";
import mammoth from "mammoth";

const ACTAS_DIR = path.join(process.cwd(), "src", "assets", "actas");

/**
 * Convierte la plantilla .docx (oficial MNC) a HTML vía mammoth e inserta
 * filas de datos y el código de acta. No requiere {{tags}} en el Word.
 */
export async function docxActaToHtmlWithData({ templateFileName, codigoActa, filasHtml, reemplazosTexto = [] }) {
    const abs = path.join(ACTAS_DIR, templateFileName);
    if (!fs.existsSync(abs)) {
        const e = new Error(`Plantilla de acta no encontrada: ${templateFileName}`);
        e.status = 500;
        throw e;
    }
    const buffer = fs.readFileSync(abs);
    const { value: html } = await mammoth.convertToHtml({ buffer });

    let out = html;

    out = out.replace(
        /<p><strong>ACT MNCR-DAF-AC-XXX-202X<\/strong><\/p>/i,
        `<p><strong>${escapeHtml(codigoActa)}</strong></p>`
    );

    for (const { buscar, reemplazar } of reemplazosTexto) {
        if (buscar && reemplazar != null) {
            out = out.split(buscar).join(reemplazar);
        }
    }

    const row8 =
        /<tr><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><\/tr>/;
    const row9 =
        /<tr><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><td><\/td><\/tr>/;

    if (row8.test(out)) {
        out = out.replace(row8, filasHtml);
    } else if (row9.test(out)) {
        out = out.replace(row9, filasHtml);
    } else {
        out = `${out}<h3>Detalle (datos generados por el sistema)</h3>${filasHtml}`;
    }

    return wrapActaPrintHtml(out);
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function wrapActaPrintHtml(innerBody) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Verdana, Arial, sans-serif; margin: 18px 20px; color: #0f172a; font-size: 10.5pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; margin-bottom: 8px; font-size: 8.5pt; table-layout: fixed; }
    th, td { border: 1px solid #94a3b8; padding: 4px 5px; vertical-align: top; word-wrap: break-word; }
    th { background: #f1f5f9; }
    p { margin: 0.3em 0; }
    td.acta-cell-hash, td.acta-cell-hash p {
      word-break: break-all;
      overflow-wrap: anywhere;
      font-family: Consolas, "Courier New", monospace;
      font-size: 8pt;
      line-height: 1.25;
    }
  </style>
</head>
<body>
${innerBody}
</body>
</html>`;
}

/** Permite partir hashes largos en varias líneas (Word respeta \u200B como punto de quiebre). */
export function breakLongTokenForWrap(text, chunkSize = 8) {
    const s = String(text ?? "").trim();
    if (!s) return "";
    if (s.length <= chunkSize) return s;
    const parts = [];
    for (let i = 0; i < s.length; i += chunkSize) {
        parts.push(s.slice(i, i + chunkSize));
    }
    return parts.join("\u200b");
}

/** Filas de tabla para acta de eliminación (8 columnas, datos por documento). */
export function buildTablaFilasActaEliminacion(filas) {
    const list = Array.isArray(filas) ? filas : [];
    return list
        .map(
            (r) =>
                `<tr>
  <td><p>${cell(r.serie_documental)}</p></td>
  <td><p>${cell(r.subserie)}</p></td>
  <td><p>${cell(r.expediente)}</p></td>
  <td><p>${cell(r.nombre)}</p></td>
  <td><p>${cell(r.titulo)}</p></td>
  <td><p>${cell(r.fecha_documento)}</p></td>
  <td class="acta-cell-hash"><p>${hashCell(r.hash)}</p></td>
  <td><p>${cell(r.tamano_archivo)}</p></td>
</tr>`
        )
        .join("\n");
}

function cell(v) {
    return escapeHtml(v == null || v === "" ? "—" : String(v));
}

function hashCell(v) {
    if (v == null || String(v).trim() === "") {
        return escapeHtml("—");
    }
    return escapeHtml(breakLongTokenForWrap(String(v).trim(), 8));
}

/** Filas de tabla para acta de transferencia (9 columnas). */
export function buildTablaFilasActaTransferencia(filas) {
    const list = Array.isArray(filas) ? filas : [];
    return list
        .map(
            (r) =>
                `<tr>
  <td><p>${cell(r.serie_documental)}</p></td>
  <td><p>${cell(r.subserie)}</p></td>
  <td><p>${cell(r.expediente)}</p></td>
  <td><p>${cell(r.nombre)}</p></td>
  <td><p>${cell(r.titulo)}</p></td>
  <td><p>${cell(r.fecha_documento)}</p></td>
  <td><p>${cell(r.vigencia_definida)}</p></td>
  <td><p>${cell(r.condiciones_acceso)}</p></td>
  <td><p>${cell(r.tamano_archivo)}</p></td>
</tr>`
        )
        .join("\n");
}

export function reemplazosArchivistaEliminacion(archivistaNombre) {
    return [
        {
            buscar:
                "<p><strong>XXXXXXXXXXXXXXXXXXXXXXX				   (Nombre del rol del archivista en el sistema)</strong></p>",
            reemplazar: `<p><strong>${escapeHtml(archivistaNombre)} (archivista en el sistema)</strong></p>`,
        },
    ];
}

export function reemplazosArchivistaTransferencia(archivistaNombre) {
    return [
        {
            buscar: "<p><strong>(Nombre del rol del archivista en el sistema)</strong></p>",
            reemplazar: `<p><strong>${escapeHtml(archivistaNombre)} (archivista en el sistema)</strong></p>`,
        },
    ];
}

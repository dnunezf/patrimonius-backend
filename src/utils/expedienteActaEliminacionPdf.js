import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
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

function getLogoDataUri() {
    const jpgPath = path.resolve(process.cwd(), "src", "assets", "logo-mncr.jpg");
    const pngPath = path.resolve(process.cwd(), "src", "assets", "logo-mncr.png");

    if (fs.existsSync(jpgPath)) {
        const buffer = fs.readFileSync(jpgPath);
        return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    }

    if (fs.existsSync(pngPath)) {
        const buffer = fs.readFileSync(pngPath);
        return `data:image/png;base64,${buffer.toString("base64")}`;
    }

    return "";
}

function buildActaEliminacionHtml(payload) {
    const logo = getLogoDataUri();
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.codigoActa)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; font-size: 11pt; }
    h1 { font-size: 16pt; margin-bottom: 4px; }
    .muted { color: #64748b; font-size: 10pt; }
    .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-size: 10pt; }
    th { background: #f1f5f9; }
    .logo { max-height: 56px; margin-bottom: 8px; }
  </style>
</head>
<body>
  ${logo ? `<img class="logo" src="${logo}" alt="Logo" />` : ""}
  <h1>Acta de eliminación documental (expediente)</h1>
  <p class="muted">Sistema Patrimonius — disposición final supervisada (HU-032)</p>
  <div class="box">
    <p><strong>Código del acta:</strong> ${escapeHtml(payload.codigoActa)}</p>
    <p><strong>Expediente:</strong> ${escapeHtml(payload.expedienteNombre)} (${escapeHtml(payload.expedienteCodigo)})</p>
    <p><strong>Unidad:</strong> ${escapeHtml(payload.unidadNombre)}</p>
    <p><strong>Serie / Subserie:</strong> ${escapeHtml(payload.serieNombre)} / ${escapeHtml(payload.subserieNombre || "—")}</p>
    <p><strong>Fecha de cierre del expediente:</strong> ${escapeHtml(formatFecha(payload.fechaCierre))}</p>
    <p><strong>Fecha de vencimiento de conservación:</strong> ${escapeHtml(formatFecha(payload.fechaVencimiento))}</p>
    <p><strong>Fecha de elaboración del acta:</strong> ${escapeHtml(formatFecha(payload.fechaActa))}</p>
    <p><strong>Justificación de aprobación:</strong></p>
    <p>${escapeHtml(payload.justificacionAprobacion)}</p>
  </div>
  <h2 style="margin-top:20px;font-size:13pt;">Documentos vinculados al expediente (referencia)</h2>
  <table>
    <thead><tr><th>#</th><th>Título</th><th>Estado</th></tr></thead>
    <tbody>
      ${(payload.documentos || [])
          .map(
              (d, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(d.titulo || "")}</td>
          <td>${escapeHtml(d.estado || "")}</td>
        </tr>`
          )
          .join("")}
    </tbody>
  </table>
  <p class="muted" style="margin-top:16px;">
    Este documento certifica la eliminación lógica del expediente en el sistema, conservando metadatos y trazabilidad en bitácora conforme a las políticas institucionales.
  </p>
</body>
</html>`;
}

/**
 * Genera PDF del acta de eliminación bajo uploads/disposicion-eliminacion/
 * @param {object} opts
 * @param {number} opts.expedienteId
 * @param {string} opts.codigoActa
 * @param {object} opts.payload — campos para plantilla HTML
 */
export async function saveActaEliminacionPdf({ expedienteId, codigoActa, payload }) {
    const dir = path.resolve(process.cwd(), "uploads", "disposicion-eliminacion");
    await fs.promises.mkdir(dir, { recursive: true });

    const html = buildActaEliminacionHtml({ ...payload, codigoActa });

    const browser = await puppeteer.launch({
        headless: true,
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        const safeId = Number(expedienteId);
        const fileName = `acta-eliminacion-expediente-${safeId}-${Date.now()}.pdf`;
        const filePath = path.join(dir, fileName);

        await page.pdf({
            path: filePath,
            format: "A4",
            printBackground: true,
            margin: {
                top: "18mm",
                right: "14mm",
                bottom: "18mm",
                left: "14mm",
            },
        });

        return {
            fileName,
            filePath,
            relativePath: `uploads/disposicion-eliminacion/${fileName}`,
        };
    } finally {
        await browser.close();
    }
}

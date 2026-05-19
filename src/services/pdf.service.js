// src/services/pdf.service.js
import puppeteer from "puppeteer";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE_HEIGHT_PX = 1122;

function findFirstDivRangeByClass(source = "", className = "") {
    const html = String(source || "");
    const targetClass = String(className || "").trim();
    if (!html || !targetClass) return null;

    const openDivRegex = /<div\b[^>]*>/gi;
    let openMatch;
    while ((openMatch = openDivRegex.exec(html)) !== null) {
        const openTag = openMatch[0];
        const classAttrMatch = openTag.match(/\bclass\s*=\s*["']([^"']*)["']/i);
        const classValue = classAttrMatch?.[1] || "";
        const classList = classValue.split(/\s+/).filter(Boolean);
        if (!classList.includes(targetClass)) continue;

        const start = openMatch.index;
        const tagRegex = /<\/?div\b[^>]*>/gi;
        tagRegex.lastIndex = start;

        let depth = 0;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(html)) !== null) {
            const tag = tagMatch[0];
            const isClose = /^<\/div/i.test(tag);
            depth += isClose ? -1 : 1;
            if (depth === 0) {
                const end = tagRegex.lastIndex;
                return {
                    start,
                    end,
                    openTag,
                    innerHtml: html.slice(start + openTag.length, tagMatch.index),
                };
            }
        }
        return null;
    }

    return null;
}

function extractLayoutSections(html = "") {
    let source = String(html || "");

    const pullSection = (cls) => {
        const range = findFirstDivRangeByClass(source, cls);
        if (!range) return "";
        source = `${source.slice(0, range.start)}${source.slice(range.end)}`;
        return String(range.innerHtml || "").trim();
    };

    const headerFirstHtml = pullSection("docx-page-header-first");
    const headerDefaultHtml = pullSection("docx-page-header");
    const footerFirstHtml = pullSection("docx-page-footer-first");
    const footerDefaultHtml = pullSection("docx-page-footer");

    const hasAutoPageToken = /doc-page-number-token/i.test(String(html || ""));

    const cleanToken = (chunk) =>
        String(chunk || "").replace(
            /<span class="doc-page-number-token"[^>]*><\/span>/gi,
            ""
        );

    return {
        bodyHtml: String(source || "").trim(),
        headerFirstHtml: cleanToken(headerFirstHtml),
        headerDefaultHtml: cleanToken(headerDefaultHtml),
        footerFirstHtml: cleanToken(footerFirstHtml),
        footerDefaultHtml: cleanToken(footerDefaultHtml),
        hasAutoPageToken,
    };
}

export const pdfService = {
    /**
     * Convierte HTML (string) -> PDF (Buffer)
     * Compatible con Puppeteer v24 (sin page.waitForTimeout)
     */
    async htmlToPdfBuffer(
        html,
        {
            title = "Documento",
            format = "A4",
            printBackground = true,
            margin = { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
            timeoutMs = 30_000,
        } = {}
    ) {
        const browser = await puppeteer.launch({
            headless: true, // v24 OK
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        try {
            const page = await browser.newPage();
            page.setDefaultNavigationTimeout(timeoutMs);

            // Viewport ayuda a que el layout no salga raro
            await page.setViewport({ width: 1200, height: 900 });
            const layout = extractLayoutSections(html);

            const activeHeaderDefault = layout.headerDefaultHtml;
            const activeFooterDefault = layout.footerDefaultHtml;
            const activeHeaderFirst = layout.headerFirstHtml;
            const activeFooterFirst = layout.footerFirstHtml;

            const fullHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${String(title).replace(/</g, "&lt;")}</title>
    <style>
      /* Reset base para evitar PDFs “vacíos” por CSS del editor */
      html, body { margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111 !important; }
      * { color: #111 !important; }

      h1,h2,h3 { margin: 0 0 10px 0; }
      p { margin: 0 0 8px 0; line-height: 1.35; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
      img { max-width: 100%; }
      .pdf-doc-body { position: relative; }
      .pdf-content { position: relative; z-index: 2; }
      .pdf-fixed-header, .pdf-fixed-footer {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 10;
        background: #fff;
      }
      .pdf-fixed-header { top: 0; border-bottom: 1px solid #d0d7e2; }
      .pdf-fixed-footer { bottom: 0; border-top: 1px solid #d0d7e2; }
      .pdf-first-override {
        position: absolute;
        left: 0;
        right: 0;
        z-index: 20;
        background: #fff;
      }
      .pdf-first-override--header { top: 0; border-bottom: 1px solid #cbd5e1; }
      .pdf-first-override--footer {
        top: ${PAGE_HEIGHT_PX - 150}px;
        border-top: 1px solid #cbd5e1;
      }
      .pdf-first-mask {
        position: absolute;
        left: 0;
        right: 0;
        z-index: 15;
        background: #fff;
      }
      .pdf-first-mask--header { top: 0; height: 160px; }
      .pdf-first-mask--footer { top: ${PAGE_HEIGHT_PX - 170}px; height: 170px; }
      body { padding-top: 120px; padding-bottom: 100px; }
      /* Valores iniciales; antes de imprimir se ajustan al alto real del encabezado/pie */
      body.has-first-header { padding-top: 130px; }
      body.has-first-footer { padding-bottom: 110px; }

      /* Por si vienen cosas del Quill */
      .ql-cursor, .ql-tooltip { display: none !important; }
    </style>
  </head>
  <body class="${activeHeaderFirst ? "has-first-header" : ""} ${activeFooterFirst ? "has-first-footer" : ""}">
    ${activeHeaderDefault ? `<div class="pdf-fixed-header">${activeHeaderDefault}</div>` : ""}
    ${activeFooterDefault ? `<div class="pdf-fixed-footer">${activeFooterDefault}</div>` : ""}

    ${activeHeaderFirst ? `<div class="pdf-first-mask pdf-first-mask--header" aria-hidden="true"></div>` : ""}
    ${activeFooterFirst ? `<div class="pdf-first-mask pdf-first-mask--footer" aria-hidden="true"></div>` : ""}
    ${activeHeaderFirst ? `<div class="pdf-first-override pdf-first-override--header">${activeHeaderFirst}</div>` : ""}
    ${activeFooterFirst ? `<div class="pdf-first-override pdf-first-override--footer">${activeFooterFirst}</div>` : ""}

    <div class="pdf-doc-body">
      <div class="pdf-content">${layout.bodyHtml || ""}</div>
    </div>
  </body>
</html>`;

            // IMPORTANTE: networkidle0 a veces deja en blanco si hay recursos “colgados”
            await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

            // Esperar fuentes (si existen)
            await page.evaluate(() =>
                document.fonts ? document.fonts.ready : Promise.resolve()
            );

            // Esperar a que imágenes (si hay) terminen
            await page.evaluate(async () => {
                const imgs = Array.from(document.images || []);
                await Promise.all(
                    imgs.map((img) =>
                        img.complete
                            ? Promise.resolve()
                            : new Promise((res) => {
                                img.addEventListener("load", res, { once: true });
                                img.addEventListener("error", res, { once: true });
                            })
                    )
                );
            });

            // Pequeña pausa para que termine el layout (sin waitForTimeout)
            await sleep(150);

            // A veces ayuda a respetar estilos tal cual en pantalla
            await page.emulateMediaType("screen");

            // Alineación body ↔ encabezado fijo: el padding fijo era bajo para banners con logos
            await page.evaluate(() => {
                const gap = 12;
                const minTop = 100;
                const minBottom = 80;
                const insetNoChrome = 8;

                const hf = document.querySelector(".pdf-fixed-header");
                const ho = document.querySelector(".pdf-first-override--header");
                const topPx = Math.max(
                    hf ? hf.getBoundingClientRect().height : 0,
                    ho ? ho.getBoundingClientRect().height : 0
                );

                const ff = document.querySelector(".pdf-fixed-footer");
                const fo = document.querySelector(".pdf-first-override--footer");
                const bottomPx = Math.max(
                    ff ? ff.getBoundingClientRect().height : 0,
                    fo ? fo.getBoundingClientRect().height : 0
                );

                const hasTopChrome = Boolean(hf || ho);
                const hasBottomChrome = Boolean(ff || fo);

                const padTop = hasTopChrome
                    ? Math.max(minTop, Math.ceil(topPx) + gap)
                    : insetNoChrome;
                const padBottom = hasBottomChrome
                    ? Math.max(minBottom, Math.ceil(bottomPx) + gap)
                    : insetNoChrome;

                document.body.style.paddingTop = `${padTop}px`;
                document.body.style.paddingBottom = `${padBottom}px`;
            });

            const buffer = await page.pdf({
                format,
                printBackground,
                margin,
                displayHeaderFooter: Boolean(layout.hasAutoPageToken),
                headerTemplate: `<div style="font-size:1px;color:transparent;width:100%;">.</div>`,
                footerTemplate: layout.hasAutoPageToken
                    ? `<div style="width:100%;padding:0 14mm 6mm;box-sizing:border-box;font-size:10px;color:#334155;text-align:right;">
                        Página <span class="pageNumber"></span> de <span class="totalPages"></span>
                       </div>`
                    : `<div></div>`,
            });

            return buffer;
        } finally {
            await browser.close();
        }
    },
};
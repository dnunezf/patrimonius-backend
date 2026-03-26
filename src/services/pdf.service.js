// src/services/pdf.service.js
import puppeteer from "puppeteer";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

      /* Por si vienen cosas del Quill */
      .ql-cursor, .ql-tooltip { display: none !important; }
    </style>
  </head>
  <body>
    ${html ?? ""}
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

            const buffer = await page.pdf({
                format,
                printBackground,
                margin,
            });

            return buffer;
        } finally {
            await browser.close();
        }
    },
};
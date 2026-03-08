// src/services/word.service.js
import htmlToDocx from "html-to-docx";

export const wordService = {
    /**
     * Convierte HTML (string) -> DOCX (Buffer)
     */
    async htmlToDocxBuffer(
        html,
        {
            title = "Documento",
            creator = "Patrimonius",
            margins = { top: 720, right: 720, bottom: 720, left: 720 }, // twips (720 = 0.5")
        } = {}
    ) {
        const cleaned = String(html ?? "")
            // evita cosas que rompen conversión
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "");

        const fullHtml = `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>${cleaned}</body>
</html>`;

        // html-to-docx puede devolver Buffer o Uint8Array según versión
        const out = await htmlToDocx(fullHtml, null, {
            title,
            creator,
            margin: margins,
        });

        return Buffer.isBuffer(out) ? out : Buffer.from(out);
    },
};
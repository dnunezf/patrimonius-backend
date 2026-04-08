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
            subject,
            keywords,
            description,
            createdAt,
            modifiedAt,
            lastModifiedBy,
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

        const docOpts = {
            title,
            creator,
            margin: margins,
        };
        if (subject != null && String(subject).trim() !== "") {
            docOpts.subject = String(subject);
        }
        if (Array.isArray(keywords) && keywords.length) {
            docOpts.keywords = keywords;
        }
        if (description != null && String(description).trim() !== "") {
            docOpts.description = String(description);
        }
        if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) {
            docOpts.createdAt = createdAt;
        }
        if (modifiedAt instanceof Date && !Number.isNaN(modifiedAt.getTime())) {
            docOpts.modifiedAt = modifiedAt;
        }
        if (lastModifiedBy != null && String(lastModifiedBy).trim() !== "") {
            docOpts.lastModifiedBy = String(lastModifiedBy);
        }

        // html-to-docx puede devolver Buffer o Uint8Array según versión
        const out = await htmlToDocx(fullHtml, null, docOpts);

        return Buffer.isBuffer(out) ? out : Buffer.from(out);
    },
};
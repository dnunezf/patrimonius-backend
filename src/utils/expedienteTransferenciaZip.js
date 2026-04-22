import fs from "fs";
import path from "path";
import archiver from "archiver";

import { documentoService } from "../services/documento.service.js";

function sanitizeZipEntryName(name) {
    return String(name || "documento.pdf").replace(/[/\\?*:|"<>]/g, "_");
}

/**
 * Paquete ZIP para transferencia HU-032: solo los PDF de los documentos del expediente
 * (misma generación que la descarga ZIP de consulta interna/externa). Sin MANIFIESTO ni LEAME.
 */
export async function crearPaqueteTransferenciaZip({
    expedienteId,
    documentosResumen,
}) {
    const dir = path.resolve(process.cwd(), "uploads", "disposicion-transferencias");
    await fs.promises.mkdir(dir, { recursive: true });

    const safeId = Number(expedienteId);
    const stamp = Date.now();
    const fileName = `transferencia-expediente-${safeId}-${stamp}.zip`;
    const filePath = path.join(dir, fileName);

    const docs = Array.isArray(documentosResumen) ? documentosResumen : [];
    const usedNames = new Set();
    const pdfEntries = [];

    for (const row of docs) {
        const docId = Number(row?.id);
        if (!Number.isInteger(docId) || docId <= 0) {
            continue;
        }
        const { filename, buffer } = await documentoService.getPdfBufferForConsultaPreview({
            documento_id: docId,
        });
        let entry = sanitizeZipEntryName(filename);
        if (usedNames.has(entry)) {
            const base = entry.replace(/\.pdf$/i, "");
            entry = sanitizeZipEntryName(`${base}_${docId}.pdf`);
        }
        usedNames.add(entry);
        pdfEntries.push({ name: entry, buffer });
    }

    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver("zip", { zlib: { level: 9 } });
        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);
        archive.pipe(output);
        for (const item of pdfEntries) {
            archive.append(item.buffer, { name: item.name });
        }
        archive.finalize();
    });

    return {
        fileName,
        filePath,
        relativePath: `uploads/disposicion-transferencias/${fileName}`,
    };
}

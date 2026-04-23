import fs from "fs";
import path from "path";
import archiver from "archiver";

import { documentoService } from "../services/documento.service.js";
import { resolverXmlEadExpediente } from "./expedienteEadMetadata.js";

function sanitizeZipEntryName(name) {
    return String(name || "documento.pdf").replace(/[/\\?*:|"<>]/g, "_");
}

/**
 * Paquete ZIP HU-032:
 * expediente/documentos/*.pdf
 * expediente/metadata.xml  (EAD — HU-035 o placeholder)
 * expediente/acta_transferencia.docx
 */
export async function crearPaqueteTransferenciaZip({
    expedienteId,
    expedienteCodigo,
    expedienteNombre,
    documentosResumen,
    actaTransferenciaDocxBuffer,
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
        pdfEntries.push({ name: `expediente/documentos/${entry}`, buffer });
    }

    const eadXml = await resolverXmlEadExpediente(safeId, {
        expedienteCodigo: expedienteCodigo ?? String(safeId),
        expedienteNombre: expedienteNombre ?? "",
    });
    const metadataBuf = Buffer.from(
        typeof eadXml === "string" ? eadXml : String(eadXml),
        "utf8"
    );

    if (!Buffer.isBuffer(actaTransferenciaDocxBuffer) || actaTransferenciaDocxBuffer.length === 0) {
        const e = new Error("Falta el acta de transferencia (.docx) para el paquete");
        e.status = 500;
        throw e;
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
        archive.append(metadataBuf, { name: "expediente/metadata.xml" });
        archive.append(actaTransferenciaDocxBuffer, { name: "expediente/acta_transferencia.docx" });
        archive.finalize();
    });

    return {
        fileName,
        filePath,
        relativePath: `uploads/disposicion-transferencias/${fileName}`,
    };
}

import fs from "fs";
import path from "path";
import archiver from "archiver";

import { documentoService } from "../services/documento.service.js";
import { resolverXmlEadExpediente } from "./expedienteEadMetadata.js";
import { uploadsPath } from "./uploads.js";
function sanitizeZipEntryName(name) {
    return String(name || "documento.pdf").replace(/[/\\?*:|"<>]/g, "_");
}

function removePdfExtension(name) {
    return String(name || "").replace(/\.pdf$/i, "");
}

/**
 * Paquete ZIP HU-032:
 * expediente/documentos/<documento>/<documento>.pdf
 * expediente/documentos/<documento>/anexos/*
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
    const dir = uploadsPath("disposicion-transferencias");
    await fs.promises.mkdir(dir, { recursive: true });

    const safeId = Number(expedienteId);
    const stamp = Date.now();
    const fileName = `transferencia-expediente-${safeId}-${stamp}.zip`;
    const filePath = path.join(dir, fileName);

    const docs = Array.isArray(documentosResumen) ? documentosResumen : [];
    const usedNames = new Set();
    const zipEntries = [];

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

        const docFolder = sanitizeZipEntryName(
            removePdfExtension(entry) || `documento_${docId}`
        );
        const docPdfPath = `expediente/documentos/${docFolder}/${entry}`;
        zipEntries.push({ name: docPdfPath, buffer });

        const anexos = await documentoService.listAnexosParaConsulta({
            documento_id: docId,
        });
        const usedAnexoNames = new Set();
        for (const anexo of anexos || []) {
            const anexoId = Number(anexo?.id);
            if (!Number.isInteger(anexoId) || anexoId <= 0) continue;
            const { filename: anexoFilename, buffer: anexoBuffer } =
                await documentoService.getAnexoFileParaConsulta({
                    documento_id: docId,
                    anexo_id: anexoId,
                });
            let safeAnexoName = sanitizeZipEntryName(
                anexoFilename || `anexo_${anexoId}`
            );
            if (usedAnexoNames.has(safeAnexoName)) {
                const dot = safeAnexoName.lastIndexOf(".");
                if (dot > 0) {
                    const base = safeAnexoName.slice(0, dot);
                    const ext = safeAnexoName.slice(dot);
                    safeAnexoName = `${base}_${anexoId}${ext}`;
                } else {
                    safeAnexoName = `${safeAnexoName}_${anexoId}`;
                }
                safeAnexoName = sanitizeZipEntryName(safeAnexoName);
            }
            usedAnexoNames.add(safeAnexoName);
            zipEntries.push({
                name: `expediente/documentos/${docFolder}/anexos/${safeAnexoName}`,
                buffer: anexoBuffer,
            });
        }
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
        for (const item of zipEntries) {
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

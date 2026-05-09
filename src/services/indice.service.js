import crypto from "crypto";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

import { indiceRepo } from "../repositories/indiceRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";
import {
    insertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId,
} from "../repositories/bitacoraExpedienteRepo.js";

function asInt(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
        const e = new Error(`${name} inválido`);
        e.code = 400;
        throw e;
    }
    return n;
}

function buildObjectHash(obj) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(obj))
        .digest("hex");
}

function addYears(date, years) {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + Number(years));
    return d;
}

function buildExpedienteIndicePayload({ expediente, documentos, actorId }) {
    return {
        expediente: {
            id: expediente.id,
            codigo: expediente.codigo,
            nombre: expediente.nombre,
            estado: expediente.estado,
            fechaCreacion: expediente.fecha_creacion,
            fechaCierre: expediente.fecha_cierre ?? null,
            unidadId: expediente.unidad_id,
            unidadNombre: expediente.unidad_nombre ?? null,
            serieId: expediente.serie_id,
            serieNombre: expediente.serie_nombre ?? null,
            subserieId: expediente.subserie_id,
            subserieNombre: expediente.subserie_nombre ?? null,
            fechaInicioVigencia: expediente.fecha_inicio_vigencia ?? null,
            fechaVencimiento: expediente.fecha_vencimiento ?? null,
        },
        fechaGeneracion: new Date().toISOString(),
        generadoPor: actorId ?? null,
        algoritmoHash: "sha256",
        totalDocumentos: documentos.length,
        documentos: documentos.map((doc, index) => {
            const tamanoBytes = getFileSizeBytesFromDoc(doc);

            return {
                orden: index + 1,
                documentoId: doc.id,
                nombre: doc.numero_serie ?? null,
                titulo: doc.titulo,
                estado: doc.estado,
                numeroSerie: doc.numero_serie ?? null,
                numeroFirmas: doc.numero_firmas ?? 0,
                firmasObtenidas: doc.firmas_obtenidas ?? 0,
                fechaDocumento: doc.fecha ?? null,
                fechaIncorporacion: doc.fecha_incorporacion ?? null,
                contenidoHash: doc.contenido_hash ?? null,
                tamanoArchivo: formatTamanoArchivo(tamanoBytes),
                tamanoBytes,
            };
        }),
    };
}

function buildActaCierrePayload({ expediente, documentos, indiceId }) {
    const anio = new Date().getFullYear();

    return {
        codigoActa: `ACT MNCR-DAF-AC-${indiceId}-${anio}`,
        fondo: "Museo Nacional de Costa Rica",
        subfondo: expediente.unidad_nombre ?? expediente.unidadNombre ?? "",
        serie: expediente.serie_nombre ?? expediente.serieNombre ?? "",
        subserie: expediente.subserie_nombre ?? expediente.subserieNombre ?? "",
        expediente: expediente.nombre ?? "",
        fechaCierre: expediente.fecha_cierre ?? expediente.fechaCierre ?? null,
        cantidadArchivos: documentos.length,
        documentos: documentos.map((doc, index) => ({
            orden: index + 1,
            nombre: doc.nombre ?? doc.numeroSerie ?? doc.numero_serie ?? "",
            titulo: doc.titulo ?? "",
            fechaDocumento: doc.fechaDocumento ?? doc.fecha ?? null,
            fechaIncorporacion: doc.fechaIncorporacion ?? doc.fecha_incorporacion ?? null,
            hash: doc.contenidoHash ?? doc.contenido_hash ?? null,
            tamanoArchivo: doc.tamanoArchivo ?? null,
        })),
    };
}

async function saveIndiceJsonFile({ indiceId, expedienteId, payload }) {
    const indicesDir = path.resolve(process.cwd(), "uploads", "indices");
    await fs.promises.mkdir(indicesDir, { recursive: true });

    const fileName = `indice-expediente-${expedienteId}-${indiceId}.json`;
    const filePath = path.join(indicesDir, fileName);

    await fs.promises.writeFile(
        filePath,
        JSON.stringify(payload, null, 2),
        "utf8"
    );

    return {
        fileName,
        filePath,
        relativePath: `uploads/indices/${fileName}`,
    };
}

function validarDocumentosParaIndice(documentos) {
    const errores = [];

    for (const doc of documentos) {
        if (!doc.numero_serie) {
            errores.push({
                documentoId: doc.id,
                motivo: "El documento no tiene número de serie/código oficial",
            });
        }

        if (!["APROBADO", "ARCHIVADO"].includes(doc.estado)) {
            errores.push({
                documentoId: doc.id,
                motivo: `Estado no permitido para indexación: ${doc.estado}`,
            });
        }
    }

    return errores;
}

function splitTextEvery(value, chunkSize = 16) {
    const text = String(value || "");
    if (!text) return "";

    const parts = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        parts.push(text.slice(i, i + chunkSize));
    }
    return parts.join("\n");
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

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getLogoForPdfPath() {
    const jpgPath = path.resolve(process.cwd(), "src", "assets", "logo-mncr.jpg");
    const pngPath = path.resolve(process.cwd(), "src", "assets", "logo-mncr.png");

    if (fs.existsSync(jpgPath)) return jpgPath.replace(/\\/g, "/");
    if (fs.existsSync(pngPath)) return pngPath.replace(/\\/g, "/");
    return "";
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

async function saveActaCierrePdfFile({ indiceId, expedienteId, payload }) {
    const indicesDir = path.resolve(process.cwd(), "uploads", "indices");
    await fs.promises.mkdir(indicesDir, { recursive: true });

    const html = buildActaCierreHtml(payload);

    const browser = await puppeteer.launch({
        headless: true,
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        const fileName = `acta-cierre-expediente-${expedienteId}-${indiceId}.pdf`;
        const filePath = path.join(indicesDir, fileName);

        await page.pdf({
            path: filePath,
            format: "A4",
            printBackground: true,
            margin: {
                top: "20mm",
                right: "12mm",
                bottom: "20mm",
                left: "12mm",
            },
        });

        return {
            fileName,
            filePath,
            relativePath: `uploads/indices/${fileName}`,
        };
    } finally {
        await browser.close();
    }
}

function buildActaCierreHtml(payload) {
    const logoSrc = getLogoDataUri();
    const documentos = (payload.documentos || [])
        .map(
            (doc) => `
            <tr>
              <td>${escapeHtml(doc.nombre || "")}</td>
              <td>${escapeHtml(doc.titulo || "")}</td>
              <td>${escapeHtml(formatFecha(doc.fechaDocumento))}</td>
              <td>${escapeHtml(formatFecha(doc.fechaIncorporacion))}</td>
              <td class="hash-cell">${escapeHtml(doc.hash || "")}</td>
              <td>${escapeHtml(doc.tamanoArchivo || "No disponible")}</td>
            </tr>
        `
        )
        .join("");

    return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.codigoActa || "Acta de cierre")}</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      margin: 40px;
      font-size: 12px;
    }
    .logo-wrap {
      text-align: center;
      margin-bottom: 12px;
    }
    .logo-wrap img {
      max-width: 420px;
      max-height: 90px;
      object-fit: contain;
    }
    .center { text-align: center; }
    .title {
      font-weight: bold;
      font-size: 16px;
      margin-top: 8px;
      margin-bottom: 6px;
    }
    .subtitle {
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .intro {
      text-align: justify;
      margin-bottom: 18px;
      line-height: 1.45;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #111827;
      padding: 6px 8px;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    th {
      background: #dbeafe;
      font-weight: bold;
      text-align: center;
    }
    .label {
      font-weight: bold;
    }
    .hash-cell {
      font-family: monospace;
      font-size: 10px;
      word-break: break-all;
    }
    .section-title {
      font-weight: bold;
      margin: 18px 0 8px;
    }
    .footer-text {
      margin-top: 18px;
      text-align: justify;
      line-height: 1.45;
    }
    .signature {
      margin-top: 56px;
      text-align: center;
    }
    .signature-line {
      margin: 0 auto 8px;
      width: 240px;
      border-top: 1px solid #111827;
    }
  </style>
</head>
<body>
<div class="logo-wrap">
  ${logoSrc ? `<img src="${logoSrc}" alt="Logo institucional" />` : ""}
</div>

  <div class="center" style="font-weight:bold;">MUSEO NACIONAL DE COSTA RICA</div>
  <div class="center" style="font-weight:bold;">DEPARTAMENTO DE ADMINISTRACIÓN Y FINANZAS</div>
  <div class="center" style="font-weight:bold; margin-bottom:18px;">ARCHIVO CENTRAL</div>

  <div class="center title">${escapeHtml(payload.codigoActa || "")}</div>
  <div class="center subtitle">ACTA DE CIERRE DE EXPEDIENTE</div>

  <div class="intro">
    Se procede a efectuar el cierre del expediente que se señala a continuación, con los documentos que contiene la lista adjunta.
  </div>

  <table>
    <tr>
      <td><span class="label">Fondo:</span> ${escapeHtml(payload.fondo || "")}</td>
      <td><span class="label">Subfondo:</span> ${escapeHtml(payload.subfondo || "")}</td>
    </tr>
    <tr>
      <td><span class="label">Serie:</span> ${escapeHtml(payload.serie || "")}</td>
      <td><span class="label">Subserie:</span> ${escapeHtml(payload.subserie || "")}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Expediente:</span> ${escapeHtml(payload.expediente || "")}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Fecha de cierre del expediente:</span> ${escapeHtml(formatFecha(payload.fechaCierre))}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Cantidad de archivos:</span> ${escapeHtml(String(payload.cantidadArchivos ?? 0))}</td>
    </tr>
  </table>

  <div class="section-title">Lista de documentos:</div>

  <table>
    <thead>
      <tr>
        <th style="width:14%">Nombre</th>
        <th style="width:22%">Título</th>
        <th style="width:12%">Fecha del documento</th>
        <th style="width:12%">Fecha de incorporación</th>
        <th style="width:30%">HASH</th>
        <th style="width:10%">Tamaño de archivo</th>
      </tr>
    </thead>
    <tbody>
      ${documentos}
    </tbody>
  </table>

  <div class="footer-text">
    El responsable de emitir este documento que representa la integridad del expediente custodiado en el Archivo Digital Institucional es el Archivo Central.
  </div>

  <div class="signature">
    <div class="signature-line"></div>
    <div><strong>Coordinadora Archivo Central</strong></div>
  </div>
</body>
</html>
    `;
}

function formatTamanoArchivo(bytes) {
    const n = Number(bytes);

    if (!Number.isFinite(n) || n <= 0) return null;

    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;

    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function resolveExistingFilePath(...values) {
    for (const value of values) {
        const raw = String(value || "").trim();
        if (!raw) continue;

        const candidates = [
            raw,
            path.resolve(process.cwd(), raw),
            path.resolve(process.cwd(), raw.replace(/^\/+/, "")),
        ];

        for (const candidate of candidates) {
            try {
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            } catch {
                // Ignorar y probar el siguiente candidato.
            }
        }
    }

    return null;
}

function getFileSizeBytesFromDoc(doc) {
    const metadataSize = Number(doc?.tamano_bytes);

    if (Number.isFinite(metadataSize) && metadataSize > 0) {
        return metadataSize;
    }

    const filePath = resolveExistingFilePath(
        doc?.signed_pdf_path,
        doc?.current_pdf_path,
        doc?.source_pdf_path,
    );

    if (!filePath) return null;

    try {
        const stat = fs.statSync(filePath);
        return Number(stat.size) || null;
    } catch {
        return null;
    }
}

export const indiceService = {
    async cerrarExpediente(expedienteId, actor) {
        const safeExpedienteId = asInt(expedienteId, "expedienteId");
        const actorId = actor?.id ?? actor?.usuario_id ?? null;

        const expediente = await indiceRepo.getExpedienteById(safeExpedienteId);
        if (!expediente) {
            const e = new Error("Expediente no encontrado");
            e.code = 404;
            throw e;
        }

        if (expediente.estado === "CERRADO") {
            const existingClosed = await indiceRepo.getIndexByExpedienteId(safeExpedienteId);
            const e = new Error("El expediente ya se encuentra cerrado");
            e.code = 409;
            e.detail = existingClosed ? { indiceExistente: existingClosed } : null;
            throw e;
        }

        if (["TRANSFERIDO", "ELIMINADO"].includes(expediente.estado)) {
            const e = new Error(
                `No se puede cerrar un expediente en estado ${expediente.estado}`
            );
            e.code = 422;
            throw e;
        }

        const documentosExpediente = await indiceRepo.getDocumentosByExpedienteId(
            safeExpedienteId
        );

        if (!documentosExpediente.length) {
            const e = new Error("No se encontraron documentos para el expediente");
            e.code = 404;
            throw e;
        }

        const erroresValidacion = validarDocumentosParaIndice(documentosExpediente);
        if (erroresValidacion.length) {
            const e = new Error(
                "El expediente no puede cerrarse porque tiene documentos con inconsistencias"
            );
            e.code = 422;
            e.detail = { errores: erroresValidacion };
            throw e;
        }

        const plazoAnios = Number(expediente.plazo_conservacion_anios ?? 0);
        if (!Number.isFinite(plazoAnios) || plazoAnios < 0) {
            const e = new Error(
                "La serie asociada al expediente no tiene un plazo de conservación válido"
            );
            e.code = 422;
            throw e;
        }

        const fechaCierre = new Date();
        const fechaInicioVigencia = new Date(fechaCierre);
        const fechaVencimiento = addYears(fechaInicioVigencia, plazoAnios);

        const expedienteParaIndice = {
            ...expediente,
            estado: "CERRADO",
            fecha_cierre: fechaCierre,
            fecha_inicio_vigencia: fechaInicioVigencia,
            fecha_vencimiento: fechaVencimiento,
        };

        const indiceJson = buildExpedienteIndicePayload({
            expediente: expedienteParaIndice,
            documentos: documentosExpediente,
            actorId,
        });

        const hash = buildObjectHash(indiceJson);

        const existing = await indiceRepo.getIndexByHash(hash);
        if (existing) {
            return {
                duplicated: true,
                expedienteId: safeExpedienteId,
                indice: existing,
                indiceJson,
            };
        }

        const created = await indiceRepo.createExpedienteIndex({
            hash,
            fecha: new Date(),
            firmaId: null,
            expedienteId: safeExpedienteId,
        });

        const actaPayload = buildActaCierrePayload({
            expediente: expedienteParaIndice,
            documentos: indiceJson.documentos,
            indiceId: created.id,
        });

        const jsonFile = await saveIndiceJsonFile({
            indiceId: created.id,
            expedienteId: safeExpedienteId,
            payload: indiceJson,
        });

        const actaPdfFile = await saveActaCierrePdfFile({
            indiceId: created.id,
            expedienteId: safeExpedienteId,
            payload: actaPayload,
        });

        const updatedIndex = await indiceRepo.updateIndexFiles(created.id, {
            jsonPath: jsonFile.relativePath,
            actaPdfPath: actaPdfFile.relativePath,
        });

        await indiceRepo.closeExpediente(safeExpedienteId, {
            fechaCierre,
            fechaInicioVigencia,
            fechaVencimiento,
        });

        const bitacoraUsuarioId = resolveBitacoraUsuarioId(actorId);
        await insertBitacoraExpedienteSafe({
            expediente_id: safeExpedienteId,
            usuario_id: bitacoraUsuarioId,
            evento: "CIERRE",
            resultado: "PERMITIDO",
            estado_anterior: expediente.estado,
            estado_nuevo: "CERRADO",
            detalle: {
                cierre: true,
                origen: "indices_cerrar_expediente",
                indiceId: created.id,
                hash,
                totalDocumentos: documentosExpediente.length,
                fechaInicioVigencia,
                fechaVencimiento,
                plazoConservacionAnios: plazoAnios,
            },
        });

        await logAdminAction({
            actorId,
            docId: null,
            action: "EXPEDIENTE_CLOSE_INDEX_GENERATE",
            result: "OK",
            detail: {
                indiceId: created.id,
                expedienteId: safeExpedienteId,
                hash,
                totalDocumentos: documentosExpediente.length,
                jsonFile: jsonFile.relativePath,
                fechaInicioVigencia,
                fechaVencimiento,
                plazoConservacionAnios: plazoAnios,
            },
        });

        return {
            duplicated: false,
            expedienteId: safeExpedienteId,
            indice: updatedIndex,
            indiceJson,
            actaPayload,
            indiceArchivo: jsonFile,
            actaPdfArchivo: actaPdfFile,
            vigencia: {
                fecha_inicio_vigencia: fechaInicioVigencia,
                fecha_vencimiento: fechaVencimiento,
                plazo_conservacion_anios: plazoAnios,
            },
        };
    },

    async list() {
        return indiceRepo.getAllIndices();
    },

    async getById(id) {
        const indiceId = asInt(id, "id");
        const row = await indiceRepo.getIndexById(indiceId);

        if (!row) {
            const e = new Error("Indice no encontrado");
            e.code = 404;
            throw e;
        }

        return row;
    },

    async getByExpedienteId(expedienteId) {
        const safeExpedienteId = asInt(expedienteId, "expedienteId");
        const row = await indiceRepo.getIndexByExpedienteId(safeExpedienteId);

        if (!row) {
            const e = new Error("No se encontró índice para el expediente");
            e.code = 404;
            throw e;
        }

        return row;
    },

    async listByExpedienteId(expedienteId) {
        const safeExpedienteId = asInt(expedienteId, "expedienteId");
        return indiceRepo.getIndicesByExpedienteId(safeExpedienteId);
    },

    async resolveIndiceArchivo(indiceId, kind) {
        const id = asInt(indiceId, "indiceId");
        const row = await indiceRepo.getIndexById(id);
        if (!row) {
            const e = new Error("Índice no encontrado");
            e.code = 404;
            throw e;
        }

        const relDb =
            kind === "pdf"
                ? row.acta_pdf_path ?? row.actaPdfPath
                : row.json_path ?? row.jsonPath;

        if (!relDb) {
            const e = new Error("Archivo no registrado para este índice");
            e.code = 404;
            throw e;
        }

        let normalized = String(relDb).trim().replace(/\\/g, "/");
        normalized = normalized.replace(/^\/+/, "");

        const absolutePath = path.resolve(process.cwd(), normalized);
        const uploadsRoot = path.resolve(process.cwd(), "uploads");
        const relToUploads = path.relative(uploadsRoot, absolutePath);
        const insideUploads =
            relToUploads !== "" &&
            !relToUploads.startsWith("..") &&
            !path.isAbsolute(relToUploads);

        if (!insideUploads) {
            const e = new Error("Ruta de archivo no permitida");
            e.code = 403;
            throw e;
        }

        if (!fs.existsSync(absolutePath)) {
            const e = new Error("El archivo no existe en el servidor");
            e.code = 404;
            throw e;
        }

        const fileName = path.basename(absolutePath);
        const mime =
            kind === "pdf"
                ? "application/pdf"
                : "application/json; charset=utf-8";

        return { absolutePath, fileName, mime };
    },


};
// src/services/documento.service.js
import fs from "fs";
import { permRepo } from "../repositories/permRepo.js";
import { pool } from "../db/pool.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { plantillaRepo } from "../repositories/plantillaRepo.js";
import { comentarioRepo } from "../repositories/comentariosRepo.js"; // shim
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { documentMetadataService } from "./documentMetadata.service.js";
import { userRepo } from "../repositories/userRepo.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { documentoAnexoRepo } from "../repositories/documentoAnexoRepo.js";
import {
    insertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId,
} from "../repositories/bitacoraExpedienteRepo.js";

import mammoth from "mammoth";
import PizZip from "pizzip";
import { rutaWebToFs } from "../utils/path.js";
import { notificacionService } from "./notificacion.service.js";
import { pdfService } from "./pdf.service.js";
import { wordService } from "./word.service.js";
import crypto from "crypto";
import { indiceService } from "./indice.service.js";
import {
    resolvePdfMetadataFields,
    embedStandardMetadataInPdfBuffer,
} from "../utils/pdfMetadataEmbed.js";
import { consultaAprobadosRepo } from "../repositories/consultaAprobados.repo.js";
import { isConsultaMasterUser } from "../utils/consultaMaster.util.js";
import { conservationIntakeService } from "./conservationIntake.service.js";

/** Helpers */
function pad2(n) {
    return String(n).padStart(2, "0");
}

function tmpSerie() {
    const d = new Date(),
        r = Math.floor(Math.random() * 9000) + 1000;
    return `TMP-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(
        d.getDate()
    )}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${r}`;
}

const MAX_NUMERO_SERIE_LENGTH = 60;
const MAX_TITULO_DOCUMENTO_LENGTH = 255;

function toUpperTrim(value) {
    return String(value || "").trim().toUpperCase();
}

function normalizeStringListToUpper(value) {
    if (Array.isArray(value)) {
        return value
            .map((v) => String(v || "").trim().toUpperCase())
            .filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/[;,]/)
            .map((v) => v.trim().toUpperCase())
            .filter(Boolean);
    }

    return [];
}

/**
 * Normaliza la lista de firmantes del body (números o objetos { id, usuario_id }).
 * Evita NaN → NULL en columnas usuario_id NOT NULL (Permiso_Usuario, Bitácora).
 */
function normalizeSignerUserIds(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const item of list) {
        let n;
        if (item != null && typeof item === "object" && !Array.isArray(item)) {
            n = Number(item.id ?? item.usuario_id ?? item.userId);
        } else {
            n = Number(item);
        }
        if (Number.isInteger(n) && n > 0) out.push(n);
    }
    return Array.from(new Set(out));
}

function normalizeKeywordsFromAny(value) {
    if (Array.isArray(value)) {
        return value
            .map((v) => String(v || "").trim())
            .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
        return value
            .split(/[;,]/)
            .map((v) => v.trim())
            .filter(Boolean);
    }
    return [];
}

function inferPreliminaryClass(text) {
    const src = String(text || "").toLowerCase();
    if (!src) return "";
    if (src.includes("contrato")) return "CONTRATO";
    if (src.includes("resolucion")) return "RESOLUCION";
    if (src.includes("acta")) return "ACTA";
    if (src.includes("informe")) return "INFORME";
    if (src.includes("oficio")) return "OFICIO";
    if (src.includes("circular")) return "CIRCULAR";
    if (src.includes("memorando") || src.includes("memo")) return "MEMORANDO";
    return "";
}

function inferClassificationCode(text) {
    const src = String(text || "");
    if (!src) return "";
    const match = src.match(/\b[A-Z]{2,10}(?:[-_]\d{1,6}){1,4}\b/);
    if (!match) return "";
    return String(match[0]).replace(/_/g, "-");
}

function inferKeywordsFromTitle(title = "") {
    const stopwords = new Set([
        "de",
        "del",
        "la",
        "el",
        "los",
        "las",
        "y",
        "en",
        "para",
        "por",
        "con",
        "sin",
        "a",
    ]);
    const words = String(title || "")
        .toLowerCase()
        .split(/[^a-zA-Z0-9áéíóúñü]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stopwords.has(w));
    return Array.from(new Set(words)).slice(0, 10);
}

function pickRawMetadataForFile({ file, fileIndex, metadataPorDocumento }) {
    if (!metadataPorDocumento) return {};

    if (Array.isArray(metadataPorDocumento)) {
        const byIndex = metadataPorDocumento.find(
            (item) => Number(item?.index) === Number(fileIndex)
        );
        if (byIndex) return byIndex;

        const byName = metadataPorDocumento.find((item) => {
            const name = String(
                item?.archivo ||
                item?.fileName ||
                item?.filename ||
                item?.originalname ||
                ""
            ).trim();

            return (
                name &&
                name.toLowerCase() === String(file?.originalname || "").trim().toLowerCase()
            );
        });
        if (byName) return byName;

        return metadataPorDocumento[fileIndex] || {};
    }

    if (typeof metadataPorDocumento === "object") {
        const key = String(file?.originalname || "").trim();
        if (key && metadataPorDocumento[key]) return metadataPorDocumento[key];
    }

    return {};
}

function buildMassiveMetadata({
                                  tituloBase,
                                  unidad_id,
                                  metadataLote = {},
                                  metadataDocumento = {},
                                  file,
                              }) {
    const base = {
        ...metadataLote,
        ...metadataDocumento,
    };

    const fechaInicio = new Date();

    const plazoConservacionAnios = normalizeOptionalInt(
        base.plazoConservacionAnios ??
        base.plazo_conservacion_anios ??
        base.plazoConservacion
    );

    const fechaCaducidad =
        plazoConservacionAnios != null
            ? computeCaducidad(fechaInicio, plazoConservacionAnios)
            : null;

    return {
        codigoReferencia: toUpperTrim(
            String(
                base.codigoReferencia ??
                base.codigo_referencia ??
                buildReferenceSuggestion(
                    base.tituloDocumento ??
                    base.titulo_documento ??
                    file?.originalname ??
                    tituloBase
                )
            )
                .replace(/\s+/g, "_")
                .replace(/[^a-zA-Z0-9-_]/g, "")
        ),

        unidadProductoraId:
            normalizeOptionalInt(
                base.unidadProductoraId ??
                base.unidad_productora_id ??
                unidad_id
            ) ?? Number(unidad_id),

        tituloDocumento: toUpperTrim(
            base.tituloDocumento ??
            base.titulo_documento ??
            base.title ??
            tituloBase ??
            ""
        ),

        palabrasClave: normalizeStringListToUpper(
            base.palabrasClave ??
            base.palabras_clave ??
            base.keywords
        ),

        tamanoBytes: Number(file?.size || 0),
        formato: "PDF",

        nombreProductores: normalizeStringListToUpper(
            base.nombreProductores ??
            base.nombre_productores ??
            base.productores ??
            base.firmantes
        ),

        fechaDocumento: normalizeOptionalDate(
            base.fechaDocumento ?? base.fecha_documento
        ),

        nivelAcceso: normalizeAccessLevel(
            base.nivelAcceso ?? base.nivel_acceso
        ),

        serieId: normalizeOptionalInt(base.serieId ?? base.serie_id),
        subserieId: normalizeOptionalInt(base.subserieId ?? base.subserie_id),
        expedienteId: normalizeOptionalInt(base.expedienteId ?? base.expediente_id),

        plazoConservacionAnios,
        fechaInicio,
        fechaCaducidad,
    };
}

async function safeAudit({
                             fecha,
                             accion,
                             resultado,
                             usuario_id,
                             documento_id,
                             evento,
                             detalle,
                         }) {
    try {
        // Snapshot para que la bitácora no cambie si el documento se actualiza luego.
        let snapshot = {};
        if (documento_id != null) {
            // Best effort: intenta capturar snapshot incluso si falla Metadato.
            try {
                const doc = await documentoRepo.findById(documento_id);
                snapshot = {
                    documento_titulo: doc?.titulo ?? null,
                    documento_codigo_unico: doc?.numero_serie ?? null,
                    documento_estado: doc?.estado ?? null,
                    // se completa más abajo (CODIGO_OFICIAL)
                };
            } catch (_e) {
                snapshot = {};
            }

            try {
                const codigoOficial = await metadatoRepo.findByTipo({
                    documento_id,
                    tipo: "CODIGO_OFICIAL",
                });
                snapshot.documento_codigo_oficial = codigoOficial?.valor ?? null;
            } catch (_e) {
                snapshot.documento_codigo_oficial = null;
            }
        }

        const baseId = await bitacoraRepo.insertBase({
            fecha: fecha ?? new Date(),
            accion,
            resultado,
            usuario_id,
            documento_id: documento_id ?? null,
        });

        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: evento ?? "OTRO",
            detalle: JSON.stringify({ ...(detalle ?? {}), snapshot }),
        });

        return baseId;
    } catch (err) {
        console.warn("⚠️ Falló bitácora:", err.message);
        return null;
    }
}

function buildReferenceSuggestion(value = "") {
    return String(value || "")
        .replace(/\.pdf$/i, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9-_]/g, "")
        .trim()
        .slice(0, 60);
}

function normalizeAccessLevel(value) {
    const allowed = ["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"];
    const normalized = String(value || "INTERNAL").trim().toUpperCase();
    return allowed.includes(normalized) ? normalized : "INTERNAL";
}

function normalizeStringList(value) {
    if (Array.isArray(value)) {
        return value.map(v => String(v || "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(/[;,]/)
            .map(v => v.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeOptionalDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOptionalInt(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function computeCaducidad(fechaInicio, plazoConservacionAnios) {
    const base = new Date(fechaInicio);
    const years = Number(plazoConservacionAnios || 0);
    const out = new Date(base);
    out.setFullYear(out.getFullYear() + years);
    return out;
}

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function decodeXmlEntities(value = "") {
    return String(value)
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function guessMimeTypeByPath(path = "") {
    const lower = String(path || "").toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    return "application/octet-stream";
}

function normalizeZipPath(basePath = "", relativePath = "") {
    const baseSegments = String(basePath).split("/").slice(0, -1);
    const rel = String(relativePath || "").replace(/\\/g, "/");
    const relSegments = rel.split("/");

    const out = [...baseSegments];
    for (const seg of relSegments) {
        if (!seg || seg === ".") continue;
        if (seg === "..") out.pop();
        else out.push(seg);
    }
    return out.join("/");
}

function parseWordRelationships(xml = "", partPath = "") {
    const map = new Map();
    if (!xml) return map;

    const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/g;
    let relMatch;
    while ((relMatch = relRegex.exec(xml)) !== null) {
        const relId = String(relMatch[1] || "").trim();
        const target = String(relMatch[2] || "").trim();
        if (!relId || !target) continue;
        map.set(relId, normalizeZipPath(partPath, target));
    }
    return map;
}

function extractRichHtmlFromWordPart(zip, partPath = "") {
    const partFile = zip.file(partPath);
    if (!partFile) return "";

    const xml = partFile.asText();
    if (!xml) return "";

    const relsPath = partPath.replace(/^word\//, "word/_rels/") + ".rels";
    const relsXml = zip.file(relsPath)?.asText?.() || "";
    const relsMap = parseWordRelationships(relsXml, partPath);

    const paragraphs = String(xml).match(/<w:p[\s\S]*?<\/w:p>/g) || [];
    const htmlParts = [];

    for (const para of paragraphs) {
        const textParts = [];
        const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        let txtMatch;
        while ((txtMatch = textRegex.exec(para)) !== null) {
            textParts.push(decodeXmlEntities(txtMatch[1] || ""));
        }
        const text = textParts.join("").trim();

        const images = [];
        const imgRegex = /<a:blip[^>]*r:embed="([^"]+)"/g;
        let imgMatch;
        while ((imgMatch = imgRegex.exec(para)) !== null) {
            const relId = String(imgMatch[1] || "").trim();
            const mediaPath = relsMap.get(relId);
            if (!mediaPath) continue;

            const mediaFile = zip.file(mediaPath);
            if (!mediaFile) continue;

            const binary = mediaFile.asBinary();
            const base64 = Buffer.from(binary, "binary").toString("base64");
            const mimeType = guessMimeTypeByPath(mediaPath);
            images.push(
                `<img src="data:${mimeType};base64,${base64}" alt="imagen-docx" style="max-width:100%;height:auto;" />`
            );
        }

        const line = `${text ? escapeHtml(text) : ""}${images.join("")}`.trim();
        if (line) htmlParts.push(`<p>${line}</p>`);
    }

    return htmlParts.join("");
}

function extractHeaderFooterHtmlFromDocxBuffer(buffer) {
    if (!buffer) return { headerHtml: "", footerHtml: "" };

    try {
        const zip = new PizZip(buffer);
        const headerFiles = zip.file(/word\/header\d+\.xml/) || [];
        const footerFiles = zip.file(/word\/footer\d+\.xml/) || [];

        const parseParts = (files) =>
            files
                .map((f) => extractRichHtmlFromWordPart(zip, f.name))
                .map((html) => html.trim())
                .filter(Boolean);

        const headers = parseParts(headerFiles);
        const footers = parseParts(footerFiles);

        const toHtml = (chunks, className) =>
            chunks.length
                ? `<div class="${className}">${chunks.join("")}</div>`
                : "";

        return {
            headerHtml: toHtml(headers, "docx-page-header"),
            footerHtml: toHtml(footers, "docx-page-footer"),
        };
    } catch (_e) {
        return { headerHtml: "", footerHtml: "" };
    }
}

function mergeBodyWithHeaderFooter(bodyHtml = "", headerHtml = "", footerHtml = "") {
    return `${headerHtml || ""}${bodyHtml || ""}${footerHtml || ""}`.trim();
}

async function getExpedienteSnapshot(expedienteId) {
    if (!expedienteId) return null;

    const [rows] = await pool.query(
        `
        SELECT
            e.id AS expediente_id,
            e.codigo AS expediente_codigo,
            e.nombre AS expediente_nombre,
            e.serie_id,
            e.subserie_id,
            s.codigo AS serie_codigo,
            s.nombre AS serie_nombre,
            ss.codigo AS subserie_codigo,
            ss.nombre AS subserie_nombre
        FROM Expediente e
        JOIN Serie s ON s.id = e.serie_id
        LEFT JOIN Subserie ss ON ss.id = e.subserie_id
        WHERE e.id = ?
        LIMIT 1
        `,
        [Number(expedienteId)]
    );

    return rows[0] ?? null;
}

function readExistingPdfBuffer(filePath) {
    const normalized = String(filePath || "").trim();

    if (!normalized) return null;

    const candidates = [
        normalized,
        `${process.cwd()}/${normalized}`,
    ];

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) {
                return {
                    path: candidate,
                    buffer: fs.readFileSync(candidate),
                };
            }
        } catch {
            // Continúa probando la siguiente ruta.
        }
    }

    return null;
}

async function getPdfPathFromMetadata(documento_id) {
    const tipos = ["SIGNED_PDF_CURRENT", "CURRENT_PDF_PATH", "SOURCE_PDF_PATH"];

    for (const tipo of tipos) {
        const [rows] = await pool.query(
            `
            SELECT valor
            FROM Metadato
            WHERE documento_id = ?
              AND tipo = ?
              AND TRIM(IFNULL(valor, '')) <> ''
            LIMIT 1
            `,
            [Number(documento_id), tipo]
        );

        const rawPath = rows[0]?.valor || null;
        const resolved = readExistingPdfBuffer(rawPath);

        if (resolved?.buffer?.length) {
            return {
                tipo,
                path: resolved.path,
                buffer: resolved.buffer,
                originalPath: rawPath,
            };
        }
    }

    return null;
}

/** Document service */
export const documentoService = {
    // ==========================================================
    // ✅ Acceso (helper)
    // ==========================================================
    /**
     * Acceso a documento: vista estándar (unidad, confidencialidad, listas HU-002/004),
     * excepción HU-005 en Permiso_Usuario, o visibilidad en consulta aprobados interna (HU-025).
     */
    async _assertHasAccess({ documento_id, usuario_id }) {
        const uid = Number(usuario_id);
        const did = Number(documento_id);
        const [acc] = await pool.query(
            `SELECT 1
             FROM VW_Documentos_Accesibles
             WHERE viewer_usuario_id = ? AND documento_id = ?
                 LIMIT 1`,
            [uid, did]
        );
        if (acc.length) return;

        const [pu] = await pool.query(
            `SELECT 1
             FROM Permiso_Usuario
             WHERE usuario_id = ? AND documento_id = ?
             LIMIT 1`,
            [uid, did]
        );
        if (pu.length) return;

        const viewer = await userRepo.findById(uid);
        if (viewer) {
            const consultaOk = await consultaAprobadosRepo.existsForInternal({
                documentoId: did,
                userId: uid,
                unidadId: viewer.unidadId ?? viewer.unidad_id,
                isMaster: isConsultaMasterUser({
                    rolId: viewer.rolId,
                    rol_id: viewer.rolId,
                    role: viewer.rol,
                }),
            });
            if (consultaOk) return;
        }

        const e = new Error("Acceso no autorizado al documento");
        e.code = "FORBIDDEN";
        throw e;
    },

    /**
     * Si hay filas HU-005 (Permiso_Usuario) para este par usuario–documento, solo EDIT
     * autoriza guardar contenido colaborativo. Así VIEW o SIGN solos no abren edición
     * aunque el usuario tenga rol editor global.
     */
    async _assertColabEditAllowedByHu005({ documento_id, usuario_id }) {
        const [rows] = await pool.query(
            `SELECT permiso FROM Permiso_Usuario
             WHERE usuario_id = ? AND documento_id = ?`,
            [Number(usuario_id), Number(documento_id)]
        );
        const perms = (rows || [])
            .map((r) => r?.permiso)
            .filter((p) => p != null && String(p).trim() !== "");
        if (!perms.length) return;
        const hasEdit = perms.some((p) => String(p).toUpperCase() === "EDIT");
        if (!hasEdit) {
            const e = new Error(
                "No tiene permiso de edición explícito para este documento."
            );
            e.code = "FORBIDDEN";
            throw e;
        }
    },
    async _hasDirectDocumentViewPermission({ documento_id, usuario_id }) {
        const [rows] = await pool.query(
            `
            SELECT 1
            FROM Permiso_Usuario
            WHERE usuario_id = ?
              AND documento_id = ?
              AND permiso = 'VIEW'
            LIMIT 1
            `,
            [Number(usuario_id), Number(documento_id)]
        );

        return rows.length > 0;
    },

    async _hasExpedienteDynamicAccess({ documento_id, usuario_id }) {
        const [rows] = await pool.query(
            `
            SELECT 1
            FROM Documento d
            INNER JOIN Permiso_Usuario_Expediente pue
                ON pue.expediente_id = d.expediente_id
            WHERE d.id = ?
              AND pue.usuario_id = ?
              AND pue.permiso = 'VIEW'
              AND d.expediente_id IS NOT NULL
              AND d.confid_level = 'PUBLIC'
              AND d.estado IN ('ARCHIVADO', 'CONSERVACION')
            LIMIT 1
            `,
            [Number(documento_id), Number(usuario_id)]
        );

        return rows.length > 0;
    },

    async _hasExternalApprovedAccessAny({ documento_id, usuario_id }) {
        const direct = await this._hasDirectDocumentViewPermission({
            documento_id,
            usuario_id,
        });

        if (direct) return true;

        return await this._hasExpedienteDynamicAccess({
            documento_id,
            usuario_id,
        });
    },

    _safeDeleteFile(filePath) {
        try {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (e) {
            console.warn("⚠️ No se pudo borrar archivo temporal:", e.message);
        }
    },

    _buildSha256(buffer) {
        return crypto.createHash("sha256").update(buffer).digest("hex");
    },

    _pdfHasDigitalSignatureMarkers(buffer) {
        const raw = buffer.toString("latin1");

        const markers = [
            "/Type /Sig",
            "/ByteRange",
            "/Contents",
            "/SubFilter",
            "/Adobe.PPKLite",
            "/ETSI.CAdES.detached",
        ];

        const found = markers.filter((m) => raw.includes(m));
        return found.length >= 2;
    },

    _isAllowedAnexoMasivo(file) {
        const originalname = String(file?.originalname || "").toLowerCase();
        const mimetype = String(file?.mimetype || "").toLowerCase();
        const ext = originalname.includes(".")
            ? `.${originalname.split(".").pop()}`
            : "";

        const allowedExts = new Set([
            ".pdf",
            ".doc",
            ".docx",
            ".xls",
            ".xlsx",
            ".ppt",
            ".pptx",
            ".jpg",
            ".jpeg",
            ".png",
            ".txt",
            ".csv",
            ".zip",
        ]);

        const allowedMimes = new Set([
            "application/pdf",
            "application/x-pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/zip",
            "application/x-zip-compressed",
            "text/plain",
            "text/csv",
        ]);

        return (
            allowedExts.has(ext) ||
            allowedMimes.has(mimetype) ||
            mimetype.startsWith("image/")
        );
    },

    async _findDocumentoByHash(hash) {
        const [rows] = await pool.query(
            `
                SELECT d.id, d.titulo, d.estado
                FROM Metadato m
                         JOIN Documento d ON d.id = m.documento_id
                WHERE m.tipo = 'FILE_HASH_SHA256'
                  AND m.valor = ?
                    LIMIT 1
            `,
            [String(hash)]
        );

        return rows[0] ?? null;
    },

    async _findDocumentoByReferenceCode(codigoReferencia) {
        const [rows] = await pool.query(
            `
        SELECT id, titulo, estado, numero_serie
        FROM Documento
        WHERE numero_serie = ?
        LIMIT 1
        `,
            [String(codigoReferencia)]
        );

        return rows[0] ?? null;
    },

    async importArchivedPdfs({
                                 files,
                                 anexos_por_documento = {},
                                 usuario_id,
                                 unidad_id,
                                 categoria_id = null,
                                 origen_documento,
                                 metadata_por_documento = null,
                                 metadata_lote = null,
                             }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        if (!unidad_id) {
            const e = new Error("No se pudo determinar la unidad del usuario");
            e.code = "BAD_REQUEST";
            throw e;
        }

        if (!Array.isArray(files) || files.length === 0) {
            const e = new Error("Debe adjuntar al menos un PDF");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const origen = String(origen_documento || "").trim().toUpperCase();

        if (!["ESCANEADO", "ELECTRONICO"].includes(origen)) {
            const e = new Error("El origen del documento debe ser ESCANEADO o ELECTRONICO");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const resultado = {
            ok: true,
            origen_documento: origen,
            total_recibidos: files.length,
            importados: [],
            rechazados: [],
        };

        const batchHashes = new Set();

        for (const [fileIndex, file] of files.entries()) {
            const filePath = file?.path;
            const originalname = file?.originalname || "documento.pdf";
            const ext = (originalname.split(".").pop() || "").toLowerCase();

            try {
                if (!filePath || !fs.existsSync(filePath)) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Archivo temporal no encontrado",
                    });
                    continue;
                }

                if (ext !== "pdf") {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Solo se permiten archivos PDF",
                    });
                    continue;
                }

                const buffer = fs.readFileSync(filePath);

                const pdfHeader = buffer.subarray(0, 5).toString("utf8");
                if (pdfHeader !== "%PDF-") {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "El archivo no tiene una estructura PDF válida",
                    });
                    continue;
                }

                const hash = this._buildSha256(buffer);

                if (batchHashes.has(hash)) {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Documento duplicado dentro del mismo lote",
                    });
                    continue;
                }

                const duplicado = await this._findDocumentoByHash(hash);
                if (duplicado) {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Documento duplicado en el sistema",
                        documento_existente_id: duplicado.id,
                        documento_existente_titulo: duplicado.titulo,
                    });
                    continue;
                }

                const tituloBase =
                    originalname.replace(/\.pdf$/i, "").trim() || "Documento importado";

                const metadataDocumento = pickRawMetadataForFile({
                    file,
                    fileIndex,
                    metadataPorDocumento: metadata_por_documento,
                });

                const metadata = buildMassiveMetadata({
                    tituloBase,
                    unidad_id,
                    metadataLote: metadata_lote || {},
                    metadataDocumento: metadataDocumento || {},
                    file,
                });

                if (!metadata.codigoReferencia) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "El código de referencia es obligatorio",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (metadata.codigoReferencia.length > MAX_NUMERO_SERIE_LENGTH) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: `El código de referencia supera el máximo permitido de ${MAX_NUMERO_SERIE_LENGTH} caracteres`,
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                const duplicadoPorCodigo = await this._findDocumentoByReferenceCode(
                    metadata.codigoReferencia
                );

                if (duplicadoPorCodigo) {
                    this._safeDeleteFile(filePath);
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Ya existe un documento con el mismo código de referencia",
                        documento_existente_id: duplicadoPorCodigo.id,
                        documento_existente_titulo: duplicadoPorCodigo.titulo,
                    });
                    continue;
                }

                if (!metadata.tituloDocumento) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "El título del documento es obligatorio",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (metadata.tituloDocumento.length > MAX_TITULO_DOCUMENTO_LENGTH) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: `El título del documento supera el máximo permitido de ${MAX_TITULO_DOCUMENTO_LENGTH} caracteres`,
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (!metadata.unidadProductoraId) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "La unidad productora es obligatoria",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (!metadata.nivelAcceso) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "El nivel de acceso es obligatorio",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (!metadata.serieId) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Debe seleccionar una serie",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (!metadata.subserieId) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Debe seleccionar una subserie",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (!metadata.expedienteId) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "Debe seleccionar un expediente",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                const expediente = await getExpedienteSnapshot(metadata.expedienteId);

                if (!expediente) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "El expediente seleccionado no existe",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (Number(expediente.serie_id) !== Number(metadata.serieId)) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "La serie seleccionada no coincide con el expediente",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                if (Number(expediente.subserie_id || 0) !== Number(metadata.subserieId)) {
                    resultado.rechazados.push({
                        archivo: originalname,
                        motivo: "La subserie seleccionada no coincide con el expediente",
                    });
                    this._safeDeleteFile(filePath);
                    continue;
                }

                const nuevoDoc = await documentoRepo.create({
                    numero_serie: metadata.codigoReferencia,
                    titulo: metadata.tituloDocumento,
                    contenido: "",
                    contenido_hash: hash,
                    estado: "ARCHIVADO",
                    fecha: new Date(),
                    unidad_id: metadata.unidadProductoraId,
                    usuario_id,
                    categoria_id: categoria_id ?? null,
                    confid_level: metadata.nivelAcceso,
                    expediente_id: metadata.expedienteId,
                });

                await documentoRepo.update(nuevoDoc.id, {
                    confid_level: metadata.nivelAcceso,
                    expediente_id: metadata.expedienteId,
                });

                const anexosDelDocumento = Array.isArray(anexos_por_documento?.[fileIndex])
                    ? anexos_por_documento[fileIndex]
                    : [];

                const anexosGuardados = [];

                for (const [anexoIndex, anexo] of anexosDelDocumento.entries()) {
                    try {
                        if (!this._isAllowedAnexoMasivo(anexo)) {
                            this._safeDeleteFile(anexo?.path);

                            anexosGuardados.push({
                                archivo: anexo?.originalname || "anexo",
                                estado: "RECHAZADO",
                                motivo: "Formato de anexo no permitido",
                            });

                            continue;
                        }

                        const createdAnexo = await documentoAnexoRepo.create({
                            documento_id: nuevoDoc.id,
                            usuario_id,
                            nombre_original: anexo.originalname,
                            nombre_guardado: anexo.filename,
                            ruta_archivo: anexo.path,
                            mime_type: anexo.mimetype || "application/octet-stream",
                            tamano_bytes: Number(anexo.size || 0),
                            descripcion: null,
                            orden_visual: anexoIndex + 1,
                        });

                        anexosGuardados.push({
                            id: createdAnexo.id,
                            archivo: createdAnexo.nombre_original,
                            estado: "IMPORTADO",
                        });
                    } catch (anexoError) {
                        console.warn(
                            "⚠️ No se pudo guardar anexo de carga masiva:",
                            anexoError?.message
                        );

                        this._safeDeleteFile(anexo?.path);

                        anexosGuardados.push({
                            archivo: anexo?.originalname || "anexo",
                            estado: "RECHAZADO",
                            motivo: anexoError?.message || "No se pudo guardar el anexo",
                        });
                    }
                }

                await metadatoRepo.upsertMap(nuevoDoc.id, {
                    CODIGO_REFERENCIA: metadata.codigoReferencia,
                    ORIGINAL_FILENAME: originalname,
                    FILE_HASH_SHA256: hash,
                    ORIGEN_DOCUMENTO: origen,

                    UNIDAD_PRODUCTORA_ID: String(metadata.unidadProductoraId),
                    TITULO_DOCUMENTO: metadata.tituloDocumento,
                    PALABRAS_CLAVE: JSON.stringify(metadata.palabrasClave || []),
                    TAMANO_BYTES: String(metadata.tamanoBytes || 0),
                    FORMATO: metadata.formato,
                    NOMBRE_PRODUCTORES: JSON.stringify(metadata.nombreProductores || []),
                    FECHA_DOCUMENTO: metadata.fechaDocumento
                        ? metadata.fechaDocumento.toISOString()
                        : "",
                    NIVEL_ACCESO: metadata.nivelAcceso,

                    SERIE_ID: expediente.serie_id ? String(expediente.serie_id) : "",
                    SUBSERIE_ID: expediente.subserie_id ? String(expediente.subserie_id) : "",
                    EXPEDIENTE_ID: String(expediente.expediente_id),

                    SERIE_CODIGO: expediente.serie_codigo || "",
                    SERIE_NOMBRE: expediente.serie_nombre || "",
                    SUBSERIE_CODIGO: expediente.subserie_codigo || "",
                    SUBSERIE_NOMBRE: expediente.subserie_nombre || "",
                    EXPEDIENTE_CODIGO: expediente.expediente_codigo || "",
                    EXPEDIENTE_NOMBRE: expediente.expediente_nombre || "",

                    PLAZO_CONSERVACION_ANIOS:
                        metadata.plazoConservacionAnios != null
                            ? String(metadata.plazoConservacionAnios)
                            : "",

                    FECHA_INICIO: metadata.fechaInicio
                        ? metadata.fechaInicio.toISOString()
                        : "",
                    FECHA_CADUCIDAD: metadata.fechaCaducidad
                        ? metadata.fechaCaducidad.toISOString()
                        : "",

                    SOURCE_PDF_PATH: String(filePath),
                    CURRENT_PDF_PATH: String(filePath),
                });

                await safeAudit({
                    accion: "CARGA_MASIVA_DOCUMENTO",
                    resultado: "PERMITIDO",
                    usuario_id,
                    documento_id: nuevoDoc.id,
                    evento: "ARCHIVADO",
                    detalle: {
                        accion_solicitada: "IMPORTAR_PDF_ARCHIVADO",
                        archivo_original: originalname,
                        origen_documento: origen,
                        hash_sha256: hash,
                        codigo_referencia: metadata.codigoReferencia,
                        expediente_id: metadata.expedienteId,
                        nivel_acceso: metadata.nivelAcceso,
                        anexos: anexosGuardados,
                        mensaje: "Documento importado correctamente",
                    },
                });

                await insertBitacoraExpedienteSafe({
                    expediente_id: Number(metadata.expedienteId),
                    usuario_id: resolveBitacoraUsuarioId(usuario_id),
                    evento: "DOCUMENTO_VINCULADO",
                    resultado: "PERMITIDO",
                    detalle: {
                        documento_id: nuevoDoc.id,
                        numero_serie: metadata.codigoReferencia,
                        titulo: metadata.tituloDocumento,
                        origen: "carga_masiva_pdf",
                        anexos_importados: anexosGuardados.filter(
                            (a) => a.estado === "IMPORTADO"
                        ).length,
                    },
                });

                batchHashes.add(hash);

                resultado.importados.push({
                    documento_id: nuevoDoc.id,
                    archivo: originalname,
                    titulo: metadata.tituloDocumento,
                    codigo_referencia: metadata.codigoReferencia,
                    nivel_acceso: metadata.nivelAcceso,
                    expediente_id: metadata.expedienteId,
                    estado: "ARCHIVADO",
                    anexos_importados: anexosGuardados.filter(
                        (a) => a.estado === "IMPORTADO"
                    ).length,
                    anexos_rechazados: anexosGuardados.filter(
                        (a) => a.estado === "RECHAZADO"
                    ).length,
                    anexos: anexosGuardados,
                });
            } catch (err) {
                this._safeDeleteFile(filePath);

                const anexosDelDocumento = Array.isArray(anexos_por_documento?.[fileIndex])
                    ? anexos_por_documento[fileIndex]
                    : [];

                for (const anexo of anexosDelDocumento) {
                    this._safeDeleteFile(anexo?.path);
                }

                resultado.rechazados.push({
                    archivo: originalname,
                    motivo: err?.message || "Error procesando archivo",
                });
            }
        }

        resultado.total_importados = resultado.importados.length;
        resultado.total_rechazados = resultado.rechazados.length;
        resultado.total_anexos_importados = resultado.importados.reduce(
            (total, item) => total + Number(item.anexos_importados || 0),
            0
        );
        resultado.total_anexos_rechazados = resultado.importados.reduce(
            (total, item) => total + Number(item.anexos_rechazados || 0),
            0
        );

        return resultado;
    },

    // =========================
    // Edición
    // =========================
    async editDocument(userId, documentId, content) {
        const permissions = await permRepo.getForUser(userId);

        if (!permissions.includes("EDIT")) {
            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id: userId,
                documento_id: Number(documentId),
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "EDITAR_DOCUMENTO",
                    motivo: "FALTA_DE_PERMISO",
                    descripcion: "No tiene permiso para editar este documento.",
                },
            });

            const e = new Error("No tiene permiso para editar este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({
            documento_id: Number(documentId),
            usuario_id: Number(userId),
        });

        const doc = await documentoRepo.findById(documentId);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const updatedDocument = await documentoRepo.updateContent(documentId, content);

        if (Number(doc.usuario_id) !== Number(userId)) {
            const editor = await userRepo.findById(userId);
            const editorNombre = editor
                ? `${editor.nombre} ${editor.apellido1 || ""}`.trim()
                : `Usuario ${userId}`;

            const link = process.env.APP_BASE_URL
                ? `${process.env.APP_BASE_URL}/documentos/${documentId}`
                : `/documentos/${documentId}`;

            await notificacionService.notifyAuthorDocumentEdited(
                {
                    documentoId: documentId,
                    documentoTitulo: doc.titulo,
                    autorId: doc.usuario_id,
                    editorNombre,
                    link,
                },
                { id: userId }
            );
        }

        await safeAudit({
            accion: "EDICION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id: userId,
            documento_id: Number(documentId),
            evento: "EDICION",
            detalle: {
                accion_solicitada: "EDITAR_DOCUMENTO",
                mensaje: "Edición aplicada",
            },
        });

        return updatedDocument;
    },

    // =========================
    // Firma vieja
    // =========================
    async signDocument(userId, documentId) {
        const permissions = await permRepo.getForUser(userId);

        if (!permissions.includes("SIGN")) {
            await safeAudit({
                accion: "FIRMA_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id: userId,
                documento_id: Number(documentId),
                evento: "FIRMA",
                detalle: {
                    accion_solicitada: "FIRMAR_DOCUMENTO",
                    motivo: "FALTA_DE_PERMISO",
                    descripcion: "No tiene permiso para firmar este documento.",
                },
            });

            const e = new Error("No tiene permiso para firmar este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({
            documento_id: Number(documentId),
            usuario_id: Number(userId),
        });

        const signedDocument = await documentoRepo.sign(documentId, userId);

        await safeAudit({
            accion: "FIRMA_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id: userId,
            documento_id: Number(documentId),
            evento: "FIRMA",
            detalle: {
                accion_solicitada: "FIRMAR_DOCUMENTO",
                mensaje: "Documento firmado",
            },
        });

        return signedDocument;
    },

    // =========================
    // Listados / acceso
    // Ya no se usa
    // =========================
    async getDocumentsFromProduction() {
        const [rows] = await pool.query("SELECT * FROM VW_Vista_Documentos");
        return rows;
    },

    async getAllDocuments() {
        const query = `
            SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha, c.nombre AS categoria
            FROM Documento d
                     LEFT JOIN Categoria c ON d.categoria_id = c.id
            ORDER BY d.fecha DESC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    /** Selector HU-005 / acceso por excepciones: solo documentos aún en flujo editable. */
    async listDocumentsEligibleForAccessExceptions() {
        const query = `
            SELECT d.id, d.titulo, d.numero_serie, d.estado, d.fecha, c.nombre AS categoria
            FROM Documento d
                     LEFT JOIN Categoria c ON d.categoria_id = c.id
            WHERE d.estado IN ('CREACION', 'EDICION')
            ORDER BY d.fecha DESC
        `;
        const [rows] = await pool.query(query);
        return rows || [];
    },

    /**
     * Listado del editor: vista + filas solo-HU005 (Permiso_Usuario) no aún reflejadas en la vista
     * durante despliegues; tras migrar VW_Documentos_Accesibles la segunda consulta solo añade duplicados
     * que se filtran por documento_id.
     */
    async getAccessibleDocuments(userId) {
        const uid = Number(userId);
        const [fromView] = await pool.query(
            `
            SELECT *
            FROM VW_Documentos_Accesibles
            WHERE viewer_usuario_id = ?
            ORDER BY fecha_creacion DESC
            `,
            [uid]
        );
        const seen = new Set((fromView || []).map((r) => Number(r.documento_id)));
        const [fromException] = await pool.query(
            `
            SELECT DISTINCT
                pu.usuario_id AS viewer_usuario_id,
                d.id AS documento_id,
                d.numero_serie,
                d.titulo,
                d.estado,
                d.fecha AS fecha_creacion,
                d.unidad_id,
                un.nombre AS unidad_nombre,
                d.usuario_id AS creador_id,
                TRIM(CONCAT(cu.nombre, ' ', cu.apellido1, ' ', IFNULL(cu.apellido2, ''))) AS creador_nombre,
                c.nombre AS categoria_nombre,
                d.numero_firmas AS firmas_requeridas,
                d.firmas_obtenidas
            FROM Permiso_Usuario pu
            JOIN Documento d ON d.id = pu.documento_id
            JOIN Unidad_Organizacional un ON un.id = d.unidad_id
            JOIN Usuario cu ON cu.id = d.usuario_id
            LEFT JOIN Categoria c ON c.id = d.categoria_id
            WHERE pu.usuario_id = ?
            `,
            [uid]
        );
        const extra = (fromException || []).filter(
            (r) => !seen.has(Number(r.documento_id))
        );
        const merged = [...(fromView || []), ...extra];
        merged.sort(
            (a, b) =>
                new Date(b.fecha_creacion).getTime() -
                new Date(a.fecha_creacion).getTime()
        );
        return merged.filter((r) => String(r.estado).toUpperCase() !== "ARCHIVADO" && String(r.estado).toUpperCase() !== "ELIMINACION");
    },
    /*async getArchivedDocumentsForExternal() {
        return await documentoRepo.findArchivedForExternal();
    },*/
    async getArchivedDocumentsForExternal(usuario_id) {
        return await documentoRepo.findArchivedForExternal(usuario_id);
    },
    async _hasExternalApprovedAccess({ documento_id, usuario_id }) {
        return await this._hasExternalApprovedAccessAny({
            documento_id,
            usuario_id,
        });
    },

    _isExternalUser(user) {
        const role =
            user?.rol ||
            user?.role ||
            user?.nombre_rol ||
            user?.rol_nombre ||
            "";

        return String(role).toUpperCase() === "USUARIO_EXTERNO";
    },

    /** Expuesto para rutas que necesitan omitir VW_Documentos_Accesibles tras validar Permiso_Usuario (HU-024). */
    isExternalUser(user) {
        return this._isExternalUser(user);
    },

    async assertExternalDocumentAccessIfNeeded({ documento_id, user }) {
        if (!this._isExternalUser(user)) return;

        const ok = await this._hasExternalApprovedAccessAny({
            documento_id,
            usuario_id: user.id,
        });

        if (!ok) {
            const e = new Error(
                "Debe tener una solicitud aprobada para acceder a este documento."
            );
            e.code = "FORBIDDEN";
            throw e;
        }
    },

    /**
     * Descarga PDF (firma / HU-018): primero el modelo estándar (VW_Documentos_Accesibles);
     * si falla, permite acceso con Permiso_Usuario VIEW (mismo criterio que listado de externos).
     * Así un usuario externo con permiso explícito no queda bloqueado por la vista aunque el JWT
     * no marque solo "USUARIO_EXTERNO".
     */
    async assertFirmaPdfDownloadAccess({ documento_id, usuario_id, user: _user }) {
        try {
            await this._assertHasAccess({ documento_id, usuario_id });
            return;
        } catch (e) {
            if (e.code !== "FORBIDDEN") throw e;
        }

        const ok = await this._hasExternalApprovedAccessAny({
            documento_id,
            usuario_id,
        });

        if (!ok) {
            const err = new Error(
                "No tiene permiso para descargar este documento. Si acaba de obtener acceso, cierre sesión y vuelva a entrar."
            );
            err.code = "FORBIDDEN";
            throw err;
        }
    },
    async getDocumentosByExpediente(expedienteId) {
        if (!expedienteId || Number.isNaN(Number(expedienteId))) {
            const e = new Error("Expediente inválido");
            e.code = "BAD_REQUEST";
            throw e;
        }

        return await documentoRepo.getByExpedienteId(Number(expedienteId));
    },

    // =========================
    // HU-007 Crear desde plantilla
    // =========================
    async createFromPlantilla({
                                  plantilla_id,
                                  titulo,
                                  categoria_id,
                                  confid_level,
                                  usuario_id,
                                  unidad_id,
                              }) {
        if (!usuario_id) throw new Error("Usuario no autenticado");
        if (!unidad_id) throw new Error("Unidad no determinada");

        const usarPlantilla =
            plantilla_id != null &&
            plantilla_id !== "" &&
            !Number.isNaN(Number(plantilla_id)) &&
            Number(plantilla_id) > 0;

        let htmlContent = "";
        let pl = null;

        if (usarPlantilla) {
            const pid = Number(plantilla_id);
            pl = await plantillaRepo.findById(pid);
            if (!pl) throw new Error("Plantilla no encontrada");

            try {
                const filePath = rutaWebToFs(pl.ruta_archivo);
                const fileBuffer = fs.readFileSync(filePath);

                const styleMap = [
                    "p[style-name='Título'] => h2.word-title",
                    "p[style-name='Encabezado'] => h3.word-header",
                    "p[style-name='Normal'] => p.word-text",
                    "r[style-name='Negrita'] => strong",
                    "r[style-name='Cursiva'] => em",
                    "table => table.word-table",
                    "th => th.word-th",
                    "td => td.word-td",
                ];

                const result = await mammoth.convertToHtml({
                    buffer: fileBuffer,
                    styleMap,
                    includeDefaultStyleMap: true,
                });

                const { headerHtml, footerHtml } =
                    extractHeaderFooterHtmlFromDocxBuffer(fileBuffer);
                htmlContent = mergeBodyWithHeaderFooter(result.value || "", headerHtml, footerHtml);
            } catch (err) {
                console.warn("⚠️ No se pudo convertir la plantilla:", err.message);
            }
        }

        const numero_serie = tmpSerie();

        const tituloFinal =
            titulo?.trim?.() ||
            (pl
                ? `Borrador - ${pl.nombre} (${pl.version})`
                : `Borrador ${numero_serie}`);

        const nuevoDoc = await documentoRepo.insertDocumento({
            numero_serie,
            titulo: tituloFinal,
            contenido: htmlContent,
            estado: "CREACION",
            confid_level: confid_level || "INTERNAL",
            fecha: new Date(),
            unidad_id,
            usuario_id,
            categoria_id: categoria_id ?? null,
        });

        if (usarPlantilla && pl) {
            await documentoRepo.linkPlantilla(nuevoDoc.id, pl.id);
        }

        await documentoRepo.insertVersion({
            documento_id: nuevoDoc.id,
            contenido: htmlContent,
            fecha: new Date(),
            nombre_versionado: pl
                ? `Inicial (${pl.nombre} v${pl.version})`
                : "Inicial (sin plantilla)",
        });

        // Importante: usar safeAudit para que la bitácora guarde snapshot del documento
        // (evita que el estado/códigos cambien en eventos ya registrados).
        await safeAudit({
            fecha: new Date(),
            accion: "CREACION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id: nuevoDoc.id,
            evento: "CREACION",
            detalle: {
                accion_solicitada: usarPlantilla ? "CREAR_DESDE_PLANTILLA" : "CREAR_SIN_PLANTILLA",
                mensaje: "Documento creado (CREACION)",
                ...(usarPlantilla && pl ? { plantilla_id: pl.id } : {}),
                numero_serie,
            },
        });

        await documentMetadataService.captureTechnical({
            documento_id: nuevoDoc.id,
            mimeType: "text/html",
            fileExt: "html",
            content: htmlContent,
            storageUri: "",
            actorId: usuario_id,
        });

        return { documento_id: nuevoDoc.id, numero_serie };
    },

    async importDocxToHtml({ fileBuffer }) {
        if (!fileBuffer) {
            const e = new Error("Debe adjuntar un archivo DOCX.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const styleMap = [
            "p[style-name='Título'] => h2.word-title",
            "p[style-name='Encabezado'] => h3.word-header",
            "p[style-name='Normal'] => p.word-text",
            "r[style-name='Negrita'] => strong",
            "r[style-name='Cursiva'] => em",
            "table => table.word-table",
            "th => th.word-th",
            "td => td.word-td",
        ];

        const result = await mammoth.convertToHtml({
            buffer: fileBuffer,
            styleMap,
            includeDefaultStyleMap: true,
        });

        const { headerHtml, footerHtml } =
            extractHeaderFooterHtmlFromDocxBuffer(fileBuffer);

        return {
            html: mergeBodyWithHeaderFooter(result.value || "", headerHtml, footerHtml),
        };
    },

    // =========================
    // HU-017 Solicitar firma
    // =========================
    async prepareForSignature({
                                  documento_id,
                                  usuario_id,
                                  firmantesIds = [],
                                  fecha_limite = null,
                              }) {
        const actorUid = Number(usuario_id);
        if (!Number.isInteger(actorUid) || actorUid <= 0) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        const firmantesNormalizados = normalizeSignerUserIds(firmantesIds);

        const doc = await documentoRepo.findById(documento_id);

        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id: actorUid });

        if (!["CREACION", "EDICION", "FIRMA_PARCIAL"].includes(doc.estado)) {
            const e = new Error("Estado no válido para preparar firma");
            e.code = "STATE_ERROR";
            throw e;
        }

        if (firmantesNormalizados.length === 0) {
            const e = new Error(
                "Debe seleccionar al menos un firmante válido (identificador de usuario numérico)",
            );
            e.code = "BAD_REQUEST";
            throw e;
        }

        await documentMetadataService.ensureDescriptiveComplete(documento_id);

        const tipoDoc =
            await metadatoRepo.findByTipo({
                documento_id,
                tipo: "DESC_PRELIM_CLASS",
            }) ||
            await metadatoRepo.findByTipo({
                documento_id,
                tipo: "EDIT_MANUAL_DOCUMENT_TYPE",
            });

        const tipoCodigo = mapTipoCodigo(tipoDoc?.valor);

        const oficial = officialIndex(documento_id, tipoCodigo);

        const MAX_NUMERO_SERIE_LENGTH = 60;
        const MAX_TITULO_DOCUMENTO_LENGTH = 255;

        await pool.query(
            `UPDATE Documento
             SET numero_serie = ?,
                 estado = 'FIRMA_PARCIAL',
                 numero_firmas = ?,
                 firmas_obtenidas = IFNULL(firmas_obtenidas, 0)
             WHERE id = ?`,
            [oficial, firmantesNormalizados.length, documento_id]
        );

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "CODIGO_OFICIAL",
            valor: oficial,
            });

            await documentMetadataService.markApproved({
            documento_id,
            actorId: actorUid,
            });

            await documentMetadataService.captureTechnical({
            documento_id,
            actorId: actorUid,
            });

        await safeAudit({
            accion: "PREPARAR_FIRMA",
            resultado: "PERMITIDO",
            usuario_id: actorUid,
            documento_id,
            evento: "FIRMA",
            detalle: {
                accion_solicitada: "PREPARAR_PARA_FIRMA",
                mensaje: `Asignado índice oficial ${oficial}`,
                numero_serie: oficial,
                firmantes: firmantesNormalizados,
                fecha_limite,
            },
        });

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "FIRMANTES_ASIGNADOS",
            valor: JSON.stringify(firmantesNormalizados),
        });

        for (const uid of firmantesNormalizados) {
            await pool.query(
                `INSERT INTO Permiso_Usuario (usuario_id, documento_id, permiso, motive)
                 VALUES (?, ?, 'SIGN', 'Asignado por solicitud de firma')
                     ON DUPLICATE KEY UPDATE motive = VALUES(motive)`,
                [uid, documento_id]
            );
        }

        await notificacionService.notifyFirma({
            documentoId: documento_id,
            actorId: actorUid,
            selectedUserIds: firmantesNormalizados,
            fechaLimite: fecha_limite,
            link: `/editor/document/${documento_id}/edit`,
        });

        return {
            ok: true,
            documento_id,
            numero_serie_oficial: oficial,
            firmantes: firmantesNormalizados,
            fecha_limite,
            estado: "FIRMA",
        };
    },

    // =========================
    // HU-008 versiones / colab / etc
    // =========================
    async getLatestVersion(documento_id) {
        return documentoRepo.getLatestVersion(documento_id);
    },

    async colabSave({ documento_id, usuario_id, contenido, base_version_id }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        const permissions = await permRepo.getForUser(usuario_id);
        if (!permissions.includes("EDIT")) {
            await safeAudit({
                accion: "EDICION_DOCUMENTO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id: Number(documento_id),
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "COLAB_GUARDAR",
                    motivo: "FALTA_DE_PERMISO",
                    descripcion: "No tiene permiso para editar este documento.",
                },
            });

            const e = new Error("No tiene permiso para editar este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });
        await this._assertColabEditAllowedByHu005({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["CREACION", "EDICION"].includes(doc.estado)) {
            const e = new Error("Documento no editable");
            e.code = "STATE_ERROR";
            throw e;
        }

        const currentContent = doc.contenido ?? "";
        const incomingContent = contenido ?? "";

        if (currentContent === incomingContent) {
            const latest = await documentoRepo.getLatestVersion(documento_id);
            return {
                version_id: latest?.id ?? 0,
                next_version: latest?.id ?? 0,
                conflict: false,
                saved: false,
                reason: "NO_CHANGES",
            };
        }

        const latest = await documentoRepo.getLatestVersion(documento_id);
        if (latest && latest.id !== base_version_id) {
            const e = new Error("Versión desactualizada");
            e.code = "VERSION_CONFLICT";
            e.details = { latest_version_id: latest.id };
            throw e;
        }

        const nextNumber = (await documentoRepo.countVersions(documento_id)) + 1;
        const nombre_versionado = `${doc.titulo}_V${nextNumber}`;

        const previousVersionId = await documentoRepo.insertVersion({
            documento_id,
            contenido: incomingContent,
            fecha: new Date(),
            nombre_versionado,
        });

        await documentoRepo.updateContenido(documento_id, incomingContent);
        await documentoRepo.updateEstado(documento_id, "EDICION");

        await documentMetadataService.captureTechnical({
            documento_id,
            mimeType: "text/html",
            fileExt: "html",
            content: incomingContent,
            storageUri: "",
            actorId: usuario_id,
        });

        if (Number(doc.usuario_id) !== Number(usuario_id)) {
            const editor = await userRepo.findById(usuario_id);
            const editorNombre = editor
                ? `${editor.nombre} ${editor.apellido1 || ""}`.trim()
                : `Usuario ${usuario_id}`;

            const link = process.env.APP_BASE_URL
                ? `${process.env.APP_BASE_URL}/documentos/${documento_id}`
                : `/documentos/${documento_id}`;

            await notificacionService.notifyAuthorDocumentEdited(
                {
                    documentoId: documento_id,
                    documentoTitulo: doc.titulo,
                    autorId: doc.usuario_id,
                    editorNombre,
                    editorEmail: editor?.email,
                    link,
                },
                { id: usuario_id }
            );
        }

        await safeAudit({
            accion: "EDICION_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "COLAB_GUARDAR",
                mensaje: "Edición colaborativa aplicada",
                version_id: previousVersionId,
                nombre_versionado,
            },
        });

        return {
            version_id: previousVersionId,
            next_version: previousVersionId,
            conflict: false,
            saved: true,
            nombre_versionado,
        };
    },

    async restoreVersion({ documento_id, version_id, usuario_id, motivo }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });
        await this._assertColabEditAllowedByHu005({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const version = await documentoRepo.findVersionById(version_id);
        if (!version || Number(version.documento_id) !== Number(documento_id)) {
            const e = new Error("Versión no encontrada o no pertenece al documento");
            e.code = "NOT_FOUND";
            throw e;
        }

        const nextNumber = (await documentoRepo.countVersions(documento_id)) + 1;
        const nombre_versionado = `${doc.titulo}_V${nextNumber}_REST`;

        const version_creada_id = await documentoRepo.insertVersion({
            documento_id,
            contenido: version.contenido,
            fecha: new Date(),
            nombre_versionado,
        });

        await documentoRepo.updateContenido(documento_id, version.contenido);
        await documentoRepo.updateEstado(documento_id, "EDICION");

        await safeAudit({
            accion: "DOC_VERSION_RESTORE",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "RESTAURAR_VERSION",
                mensaje: `Restaurada desde versión ${version_id}`,
                version_origen_id: version_id,
                version_creada_id,
                motivo: motivo ?? "",
                nombre_versionado,
            },
        });

        return {
            documento_id,
            version_origen_id: version_id,
            version_restaurada_id: version_creada_id,
            nombre_versionado,
            html: version.contenido,
        };
    },

    async listVersions(documento_id) {
        const [rows] = await pool.query(
            `SELECT v.id, v.fecha, v.nombre_versionado
             FROM Version_Documento v
             WHERE v.documento_id = ?
             ORDER BY v.fecha DESC, v.id DESC`,
            [documento_id]
        );
        return rows;
    },

    // =========================
    // HU-016 comentarios
    // =========================
    async listComentarios(documento_id) {
        return comentarioRepo.listByDocumento(documento_id);
    },

    async addComentario({ documento_id, usuario_id, descripcion }) {
        const comentario_id = await comentarioRepo.insert({
            documento_id,
            usuario_id,
            descripcion,
        });

        return { comentario_id };
    },

    async resolveComentario({ comentario_id, usuario_id }) {
        const com = await comentarioRepo.findById(comentario_id);
        if (!com) throw new Error("Comentario no existe");
        await comentarioRepo.resolve(comentario_id);

        return { ok: true };
    },

    // =========================
    // Lectura contenido
    // =========================
    async getContenido({ documento_id, usuario_id, skipAccessCheck = false }) {
        if (!skipAccessCheck) {
            await this._assertHasAccess({ documento_id, usuario_id });
        }

        const doc = await documentoRepo.getContenido(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const latest = await documentoRepo.getLatestVersion(documento_id);
        const availablePdf = await getPdfPathFromMetadata(documento_id);

        return {
            documento_id,
            titulo: doc.titulo,
            estado: doc.estado,
            contenido: doc.contenido ?? "",
            latest_version_id: latest?.id ?? 0,

            has_signed_pdf: availablePdf?.tipo === "SIGNED_PDF_CURRENT",
            signed_pdf_url:
                availablePdf?.tipo === "SIGNED_PDF_CURRENT"
                    ? `/documentos/${documento_id}/firma/pdf-actual`
                    : null,

            has_pdf_file: Boolean(availablePdf),
            pdf_file_source: availablePdf?.tipo || null,
            preview_pdf_url: availablePdf
                ? `/documentos/${documento_id}/consulta/preview-pdf`
                : null,

            prefer_signed_pdf_view:
                Boolean(availablePdf) &&
                ["APROBADO", "ARCHIVADO", "CONSERVACION", "FIRMA_PARCIAL"].includes(
                    String(doc.estado || "").toUpperCase()
                ),
        };
    },


    /**
     * Nombre de archivo en consulta, ZIP de expediente y transferencia HU-032:
     * prioriza `numero_serie` (código oficial OFI-… / INF-…), sin sufijos como `_firmado`.
     */
    buildConsultaPdfDownloadFilename(doc) {
        const serie = String(doc?.numero_serie ?? doc?.codigo ?? "").trim();
        const safeCodigo = serie.replace(/[/\\?*:|"<>]/g, "_").replace(/\s+/g, "_");
        if (safeCodigo) {
            return `${safeCodigo}.pdf`;
        }
        const safeTitle = String(doc?.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);
        const id = Number(doc?.id ?? doc?.documento_id) || 0;
        return `${safeTitle}_${id}.pdf`;
    },

    async getPdfBufferForConsultaPreview({ documento_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["APROBADO", "ARCHIVADO", "CONSERVACION", "FIRMA_PARCIAL", "FIRMA"].includes(doc.estado)) {
            const e = new Error(
                `El documento no está disponible para vista previa o descarga (estado: ${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const pdfMetaFields = await this._resolvePdfEmbedFields(documento_id, doc);

        const availablePdf = await getPdfPathFromMetadata(documento_id);

        if (availablePdf?.buffer?.length) {
            const withMeta = await embedStandardMetadataInPdfBuffer(
                availablePdf.buffer,
                pdfMetaFields
            );

            return {
                filename: this.buildConsultaPdfDownloadFilename(doc),
                buffer: withMeta,
            };
        }

        const html = String(doc.contenido || "").trim();
        if (!html) {
            const e = new Error(
                "El documento no tiene contenido HTML ni archivo PDF físico disponible para vista previa o descarga."
            );
            e.code = "BAD_REQUEST";
            throw e;
        }

        const cleanedHtml = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<link[^>]*rel=["']?preconnect["']?[^>]*>/gi, "")
            .replace(/<link[^>]*rel=["']?dns-prefetch["']?[^>]*>/gi, "");

        const buffer = await pdfService.htmlToPdfBuffer(cleanedHtml, {
            title: doc.titulo || "Documento",
        });

        const withMeta = await embedStandardMetadataInPdfBuffer(buffer, pdfMetaFields);

        return {
            filename: this.buildConsultaPdfDownloadFilename(doc),
            buffer: withMeta,
        };
    },

    // ==========================================================
    // ✅ Firma (MVP): info + descargar + confirmar (subir PDF)
    // ==========================================================
    async _canUserSign({ documento_id, usuario_id }) {
        const [rows] = await pool.query(
            `SELECT 1
             FROM Permiso_Usuario
             WHERE usuario_id = ? AND documento_id = ? AND permiso = 'SIGN'
                 LIMIT 1`,
            [Number(usuario_id), Number(documento_id)]
        );
        return rows.length > 0;
    },

    async _getMetadatoValor(documento_id, tipo) {
        const [rows] = await pool.query(
            `SELECT valor FROM Metadato WHERE documento_id = ? AND tipo = ? LIMIT 1`,
            [Number(documento_id), String(tipo)]
        );
        return rows[0]?.valor ?? null;
    },

    /** Nombre de unidad productora para metadatos PDF (EDIT_AUTO_PRODUCER_UNIT_ID o unidad del documento). */
    async _resolveProducerUnitNameForPdf(doc, metadatoMap) {
        const raw =
            metadatoMap?.EDIT_AUTO_PRODUCER_UNIT_ID ||
            metadatoMap?.DESC_RESPONSIBLE_UNIT_ID ||
            doc?.unidad_id;
        const id = Number(raw);
        if (!Number.isFinite(id) || id <= 0) return null;
        const [rows] = await pool.query(
            `SELECT nombre FROM Unidad_Organizacional WHERE id = ? LIMIT 1`,
            [id]
        );
        return rows[0]?.nombre ?? null;
    },

    /** Categoría y nombres de serie/subserie/expediente para el asunto del PDF (IDs en metadatos FINAL_*). */
    async _resolvePdfExtraContext(doc, metadatoMap) {
        const m = metadatoMap || {};
        const ctx = {
            categoriaNombre: null,
            serieNombre: null,
            subserieNombre: null,
            expedienteNombre: null,
            estadoDocumento: doc?.estado ?? null,
        };

        if (doc?.categoria_id) {
            const [rows] = await pool.query(`SELECT nombre FROM Categoria WHERE id = ? LIMIT 1`, [
                doc.categoria_id,
            ]);
            ctx.categoriaNombre = rows[0]?.nombre ?? null;
        }

        const sid = Number(m.FINAL_CLASSIFICATION_SERIE_ID);
        if (Number.isFinite(sid) && sid > 0) {
            const [rows] = await pool.query(`SELECT nombre FROM Serie WHERE id = ? LIMIT 1`, [sid]);
            ctx.serieNombre = rows[0]?.nombre ?? null;
        }

        const ssid = Number(m.FINAL_CLASSIFICATION_SUBSERIE_ID);
        if (Number.isFinite(ssid) && ssid > 0) {
            const [rows] = await pool.query(`SELECT nombre FROM Subserie WHERE id = ? LIMIT 1`, [ssid]);
            ctx.subserieNombre = rows[0]?.nombre ?? null;
        }

        const eid = Number(m.FINAL_CLASSIFICATION_EXPEDIENTE_ID);
        if (Number.isFinite(eid) && eid > 0) {
            const [rows] = await pool.query(
                `SELECT nombre, codigo FROM Expediente WHERE id = ? LIMIT 1`,
                [eid]
            );
            if (rows[0]) {
                ctx.expedienteNombre = [rows[0].codigo, rows[0].nombre].filter(Boolean).join(" — ");
            }
        }

        return ctx;
    },

    /**
     * Metadatos para incrustar en PDF/DOCX (misma lógica que descarga consulta HU-025).
     */
    async _resolvePdfEmbedFields(documento_id, doc) {
        const metadatoMap = await metadatoRepo.getMap(documento_id);

        let authorDisplayName = null;
        const hasAuthorInMeta =
            (metadatoMap.DESC_AUTHOR && String(metadatoMap.DESC_AUTHOR).trim()) ||
            (metadatoMap.EDIT_AUTO_CREATION_RESPONSIBLE &&
                String(metadatoMap.EDIT_AUTO_CREATION_RESPONSIBLE).trim());
        if (!hasAuthorInMeta && doc.usuario_id) {
            const u = await userRepo.findById(doc.usuario_id);
            if (u) {
                authorDisplayName =
                    [u.nombre, u.apellido1, u.apellido2].filter(Boolean).join(" ").trim() || null;
            }
        }

        const producerUnitName = await this._resolveProducerUnitNameForPdf(doc, metadatoMap);
        const extraContext = await this._resolvePdfExtraContext(doc, metadatoMap);

        return resolvePdfMetadataFields({
            doc,
            metadatoMap,
            authorDisplayName,
            producerUnitName,
            extraContext,
        });
    },

    async _getSignedList(documento_id) {
        const raw = await this._getMetadatoValor(documento_id, "FIRMAS_REALIZADAS");
        if (!raw) return [];
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : [];
        } catch {
            return [];
        }
    },

    async _setSignedList(documento_id, signedUserIds) {
        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "FIRMAS_REALIZADAS",
            valor: JSON.stringify(Array.from(new Set((signedUserIds || []).map(Number)))),
        });
    },

    async getSignatureInfo({ documento_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const readNumeroSerie = (row) => {
            if (!row || typeof row !== "object") return null;
            const direct =
                row.numero_serie ??
                row.NUMERO_SERIE ??
                row.numeroSerie;
            if (direct != null && String(direct).trim() !== "") {
                return String(direct).trim();
            }
            const hit = Object.entries(row).find(
                ([k]) => String(k).toLowerCase() === "numero_serie",
            );
            const v = hit?.[1];
            if (v != null && String(v).trim() !== "") return String(v).trim();
            return null;
        };

        const estado = doc.estado;
        const estadoOk = ["FIRMA", "FIRMA_PARCIAL"].includes(estado);

        const puedePorPermiso = await this._canUserSign({ documento_id, usuario_id });
        const signedList = await this._getSignedList(documento_id);
        const ya_firmo = signedList.includes(Number(usuario_id));

        const firmas_requeridas = Number(doc.numero_firmas || 0);
        const firmas_obtenidas = Number(doc.firmas_obtenidas || 0);

        let puede_firmar = true;
        let motivo = null;

        if (!estadoOk) {
            puede_firmar = false;
            motivo = `El documento no está en estado de firma (estado actual: ${estado}).`;
        } else if (!puedePorPermiso) {
            puede_firmar = false;
            motivo = "No estás asignado como firmante para este documento.";
        } else if (ya_firmo) {
            puede_firmar = false;
            motivo = "Ya firmaste este documento.";
        } else if (firmas_requeridas > 0 && firmas_obtenidas >= firmas_requeridas) {
            puede_firmar = false;
            motivo = "El documento ya alcanzó el total de firmas requeridas.";
        }

        return {
            documento_id,
            titulo: doc.titulo,
            codigo: readNumeroSerie(doc),
            estado,
            firmas_requeridas,
            firmas_obtenidas,
            ya_firmo,
            puede_firmar,
            motivo,
        };
    },

    async confirmSignature({ documento_id, usuario_id, signedPdfPath }) {
        if (!signedPdfPath) {
            const e = new Error("Debe adjuntar un PDF firmado");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const lowerPath = String(signedPdfPath).trim().toLowerCase();
        if (!lowerPath.endsWith(".pdf")) {
            const e = new Error("El archivo adjunto debe ser un PDF.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        if (!["FIRMA", "FIRMA_PARCIAL"].includes(doc.estado)) {
            const e = new Error(
                `El documento no está en estado de firma (estado actual: ${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const puedeFirmar = await this._canUserSign({ documento_id, usuario_id });
        if (!puedeFirmar) {
            const e = new Error("No estás asignado como firmante para este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        const signedList = await this._getSignedList(documento_id);

        if (signedList.includes(Number(usuario_id))) {
            const e = new Error("Ya firmaste este documento.");
            e.code = "FORBIDDEN";
            throw e;
        }

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: `SIGNED_PDF_${Number(usuario_id)}`,
            valor: String(signedPdfPath),
        });

        await metadatoRepo.upsertByTipo({
            documento_id,
            tipo: "SIGNED_PDF_CURRENT",
            valor: String(signedPdfPath),
        });

        signedList.push(Number(usuario_id));
        const uniqueSigned = Array.from(new Set(signedList.map(Number)));

        await this._setSignedList(documento_id, uniqueSigned);

        const nuevasObtenidas = uniqueSigned.length;
        const firmasRequeridas = Number(doc.numero_firmas || 0);

        const nuevoEstado =
            firmasRequeridas > 0 && nuevasObtenidas >= firmasRequeridas
                ? "ARCHIVADO"
                : nuevasObtenidas > 0
                    ? "FIRMA_PARCIAL"
                    : "FIRMA";

        await pool.query(
            `UPDATE Documento
             SET firmas_obtenidas = ?,
                 estado = ?
             WHERE id = ?`,
            [nuevasObtenidas, nuevoEstado, Number(documento_id)]
        );

        await safeAudit({
            accion: "CONFIRMAR_FIRMA",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "FIRMA",
            detalle: {
                accion_solicitada: "CONFIRMAR_FIRMA",
                signedPdfPath,
                firmas_obtenidas: nuevasObtenidas,
                firmas_requeridas: firmasRequeridas,
                estado_resultante: nuevoEstado,
            },
        });

        return {
            ok: true,
            documento_id,
            estado: nuevoEstado,
            firmas_obtenidas: nuevasObtenidas,
            firmas_requeridas: firmasRequeridas,
        };
    },

    async getCurrentSignedPdf({ documento_id, usuario_id }) {
        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const currentPath = await this._getMetadatoValor(documento_id, "SIGNED_PDF_CURRENT");
        if (!currentPath) {
            const e = new Error("El documento no tiene un PDF firmado actual.");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!fs.existsSync(currentPath)) {
            const e = new Error("No se encontró el archivo PDF firmado.");
            e.code = "NOT_FOUND";
            throw e;
        }

        const buffer = fs.readFileSync(currentPath);

        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        return {
            filename: `${safeTitle}_${documento_id}_firmado.pdf`,
            buffer,
        };
    },

    async downloadPdfForSignature({ documento_id, usuario_id, skipAccessCheck = false }) {
        if (!skipAccessCheck) {
            await this._assertHasAccess({ documento_id, usuario_id });
        }

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        // Permitir descargar para firma mientras esté en proceso,
        // y también devolver el firmado actual si ya quedó archivado.
        if (!["FIRMA", "FIRMA_PARCIAL", "ARCHIVADO"].includes(doc.estado)) {
            const e = new Error(
                `El documento no está disponible para descarga de firma (estado actual: ${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        const pdfMetaFields = await this._resolvePdfEmbedFields(documento_id, doc);

        // ✅ PRIORIDAD 1: si ya existe un PDF firmado actual, devolver ese
        const availablePdf = await getPdfPathFromMetadata(documento_id);

        if (availablePdf?.buffer?.length) {
            const withMeta = await embedStandardMetadataInPdfBuffer(
                availablePdf.buffer,
                pdfMetaFields
            );

            return {
                filename:
                    availablePdf.tipo === "SIGNED_PDF_CURRENT"
                        ? `${safeTitle}_${documento_id}_firmado_actual.pdf`
                        : `${safeTitle}_${documento_id}.pdf`,
                buffer: withMeta,
            };
        }

        // ✅ PRIORIDAD 2: si todavía no hay firmado actual, generar desde HTML
        const html = String(doc.contenido || "").trim();
        if (!html) {
            const e = new Error("El documento no tiene contenido para exportar a PDF.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const cleanedHtml = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<link[^>]*rel=["']?preconnect["']?[^>]*>/gi, "")
            .replace(/<link[^>]*rel=["']?dns-prefetch["']?[^>]*>/gi, "");

        const buffer = await pdfService.htmlToPdfBuffer(cleanedHtml, {
            title: doc.titulo || "Documento",
        });

        const withMeta = await embedStandardMetadataInPdfBuffer(buffer, pdfMetaFields);

        return {
            filename: `${safeTitle}_${documento_id}.pdf`,
            buffer: withMeta,
        };
    },

    async downloadDocxForSignature({ documento_id, usuario_id }) {
        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!["FIRMA", "FIRMA_PARCIAL"].includes(doc.estado)) {
            const e = new Error(`El documento no está en estado de firma (estado actual: ${doc.estado}).`);
            e.code = "STATE_ERROR";
            throw e;
        }

        const html = String(doc.contenido || "");
        const safeTitle = String(doc.titulo || "documento")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 50);

        const meta = await this._resolvePdfEmbedFields(documento_id, doc);
        const subjectDesc =
            meta.subject && meta.subject.length > 2000
                ? `${meta.subject.slice(0, 1997)}…`
                : meta.subject;

        const buffer = await wordService.htmlToDocxBuffer(html, {
            title: meta.title || doc.titulo || "Documento",
            creator: meta.creator || "Patrimonius",
            subject: meta.subject,
            keywords: meta.keywords,
            description: subjectDesc,
            createdAt: meta.creationDate,
            modifiedAt: meta.modificationDate || new Date(),
            lastModifiedBy: meta.author,
        });

        return {
            filename: `${safeTitle}_${documento_id}.docx`,
            buffer,
        };
    },

    // =========================
    // 📎 ANEXOS
    // =========================
    async addAnexo({ documento_id, usuario_id, file, descripcion = null }) {
        if (!file) {
            const e = new Error("Debe adjuntar un archivo.");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        if (!["FIRMA", "FIRMA_PARCIAL"].includes(doc.estado)) {
            // Registrar intento en bitácora (aunque falle por estado).
            await safeAudit({
                accion: "ANEXO_AGREGADO",
                resultado: "DENEGADO",
                usuario_id,
                documento_id,
                evento: "EDICION",
                detalle: {
                    accion_solicitada: "AGREGAR_ANEXO",
                    motivo: "ESTADO_NO_PERMITIDO",
                    estado_actual: doc.estado,
                },
            });

            const e = new Error(
                `No se pueden agregar anexos en el estado actual (${doc.estado}).`
            );
            e.code = "STATE_ERROR";
            throw e;
        }

        const actuales = await documentoAnexoRepo.listByDocumento(documento_id);
        const orden_visual = (actuales?.length || 0) + 1;

        const created = await documentoAnexoRepo.create({
            documento_id,
            usuario_id,
            nombre_original: file.originalname,
            nombre_guardado: file.filename,
            ruta_archivo: file.path,
            mime_type: file.mimetype || "application/octet-stream",
            tamano_bytes: Number(file.size || 0),
            descripcion: descripcion ?? null,
            orden_visual,
        });

        await safeAudit({
            accion: "ANEXO_AGREGADO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "AGREGAR_ANEXO",
                anexo_id: created.id,
                nombre_original: created.nombre_original,
                mime_type: created.mime_type,
                tamano_bytes: created.tamano_bytes,
            },
        });

        return created;
    },

    async listAnexos({ documento_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        return await documentoAnexoRepo.listByDocumento(documento_id);
    },

    /**
     * Lista anexos tras `consultaAprobadosService.assertCanAccess` .
     * No usa `_assertHasAccess` (VW editor); el acceso lo define solo la consulta aprobada / VIEW.
     */
    async listAnexosParaConsulta({ documento_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }
        return await documentoAnexoRepo.listByDocumento(documento_id);
    },

    async getAnexoFile({ documento_id, anexo_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const anexo = await documentoAnexoRepo.findById(anexo_id);
        if (!anexo || Number(anexo.documento_id) !== Number(documento_id)) {
            const e = new Error("Anexo no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!fs.existsSync(anexo.ruta_archivo)) {
            const e = new Error("No se encontró el archivo del anexo.");
            e.code = "NOT_FOUND";
            throw e;
        }

        const buffer = fs.readFileSync(anexo.ruta_archivo);

        return {
            filename: anexo.nombre_original,
            mime_type: anexo.mime_type || "application/octet-stream",
            buffer,
        };
    },

    /**
     * Descarga de anexo tras `assertCanAccess` en `/documents/...` 
     */
    async getAnexoFileParaConsulta({ documento_id, anexo_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        const anexo = await documentoAnexoRepo.findById(anexo_id);
        if (!anexo || Number(anexo.documento_id) !== Number(documento_id)) {
            const e = new Error("Anexo no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (!fs.existsSync(anexo.ruta_archivo)) {
            const e = new Error("No se encontró el archivo del anexo.");
            e.code = "NOT_FOUND";
            throw e;
        }

        const buffer = fs.readFileSync(anexo.ruta_archivo);

        return {
            filename: anexo.nombre_original,
            mime_type: anexo.mime_type || "application/octet-stream",
            buffer,
        };
    },

    async deleteAnexo({ documento_id, anexo_id, usuario_id }) {
        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        if (doc.estado === "ARCHIVADO") {
            const e = new Error("No se pueden eliminar anexos de un documento archivado.");
            e.code = "STATE_ERROR";
            throw e;
        }

        const anexo = await documentoAnexoRepo.findById(anexo_id);
        if (!anexo || Number(anexo.documento_id) !== Number(documento_id)) {
            const e = new Error("Anexo no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        await documentoAnexoRepo.deleteById(anexo_id);

        if (anexo.ruta_archivo && fs.existsSync(anexo.ruta_archivo)) {
            try {
                fs.unlinkSync(anexo.ruta_archivo);
            } catch (err) {
                console.warn("⚠️ No se pudo borrar el archivo físico del anexo:", err.message);
            }
        }

        await safeAudit({
            accion: "ANEXO_ELIMINADO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "EDICION",
            detalle: {
                accion_solicitada: "ELIMINAR_ANEXO",
                anexo_id,
                nombre_original: anexo.nombre_original,
            },
        });

        return { ok: true };
    },

    async archiveDocument({ documento_id, usuario_id }) {
        if (!usuario_id) {
            const e = new Error("No autenticado");
            e.code = "FORBIDDEN";
            throw e;
        }

        await this._assertHasAccess({ documento_id, usuario_id });

        const doc = await documentoRepo.findById(documento_id);
        if (!doc) {
            const e = new Error("Documento no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        // Validación de firma digital retirada de HU-20:
        // no se bloquea archivado por verificacion_firma_estado.
        const [rows] = await pool.query(
            `
                SELECT verificacion_firma_estado
                FROM Documento
                WHERE id = ?
            `,
            [Number(documento_id)]
        );

        const estadoVerif = rows?.[0]?.verificacion_firma_estado ?? "NO_APLICA";

        await pool.query(
            `
                UPDATE Documento
                SET estado = 'ARCHIVADO'
                WHERE id = ?
            `,
            [Number(documento_id)]
        );

        await safeAudit({
            accion: "ARCHIVAR_DOCUMENTO",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id,
            evento: "ARCHIVADO",
            detalle: {
                accion_solicitada: "ARCHIVAR_DOCUMENTO",
                verificacion_firma_estado: estadoVerif,
                mensaje: "Documento archivado",
            },
        });

        try {
            await notificacionService.notifyArchivado({
                documentoId: documento_id,
                actorId: usuario_id,
            });
        } catch (e) {
            console.warn("⚠️ No se pudo notificar archivado:", e?.message);
        }

        return {
            ok: true,
            documento_id,
            estado: "ARCHIVADO",
            verificacion_firma_estado: estadoVerif,
        };
    },
    // Método para obtener los documentos pendientes de clasificación
    async getDocumentsPendingClassification() {
        const query = `
            SELECT d.id, d.titulo, d.numero_serie, d.estado, e.nombre AS expediente
            FROM Documento d
                     LEFT JOIN Expediente e ON d.expediente_id = e.id
            WHERE d.expediente_id IS NOT NULL  -- Obtener todos los documentos con expediente_id asignado
            ORDER BY d.fecha DESC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    // Método para actualizar el expediente de un documento
    async updateDocumentoExpediente(documentoId, expedienteId, actorUserId) {
        const doc = await documentoRepo.findById(documentoId);
        if (!doc) {
            throw new Error("Documento no encontrado");
        }
        const prevExp = doc.expediente_id;

        const query = `
      UPDATE Documento
      SET expediente_id = ?
      WHERE id = ?
    `;
        const [res] = await pool.query(query, [expedienteId, documentoId]);
        if (res.affectedRows === 0) {
            throw new Error("Documento no encontrado");
        }

        const nextId =
            expedienteId === null || expedienteId === undefined
                ? null
                : Number(expedienteId);
        const shouldLog =
            nextId != null &&
            Number.isFinite(nextId) &&
            nextId > 0 &&
            Number(prevExp ?? 0) !== nextId;

        if (shouldLog) {
            await insertBitacoraExpedienteSafe({
                expediente_id: nextId,
                usuario_id: resolveBitacoraUsuarioId(actorUserId),
                evento: "DOCUMENTO_VINCULADO",
                resultado: "PERMITIDO",
                detalle: {
                    documento_id: Number(documentoId),
                    expediente_id_anterior: prevExp ?? null,
                },
            });
        }

        return { documentoId, expedienteId };
    },
};
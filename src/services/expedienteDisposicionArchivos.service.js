// src/services/expedienteDisposicionArchivos.service.js
import fs from "fs";
import path from "path";
import { pool } from "../db/pool.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { documentoAnexoRepo } from "../repositories/documentoAnexoRepo.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { indiceRepo } from "../repositories/indiceRepo.js";
import { documentoService } from "./documento.service.js";

function safeUnlinkFile(absPath) {
    if (!absPath || typeof absPath !== "string") return;
    const norm = path.normalize(absPath);
    if (!norm.startsWith(path.normalize(process.cwd()))) {
        return;
    }
    try {
        if (fs.existsSync(norm) && fs.statSync(norm).isFile()) {
            fs.unlinkSync(norm);
        }
    } catch {
        // continuar con otros
    }
}

/**
 * Resuelve ruta absoluta bajo el proyecto a partir de valor almacenado
 * (absoluta, o relativa tipo "uploads/...").
 */
function toAbsProjectPath(maybe) {
    if (maybe == null || String(maybe).trim() === "") return null;
    const s = String(maybe).trim();
    if (path.isAbsolute(s)) {
        return path.normalize(s);
    }
    if (s.startsWith("uploads/") || s.startsWith("uploads\\")) {
        return path.resolve(process.cwd(), s);
    }
    if (s.startsWith("/uploads/")) {
        return path.join(process.cwd(), s.replace(/^\//, ""));
    }
    return path.resolve(process.cwd(), s);
}

/**
 * Tras aprobación de eliminación HU-032: elimina archivos en disco (PDF y anexos;
 * versiones) y deja el documento en estado ELIMINACION con contenido no referenciado.
 * No borra el registro Documento.
 */
export async function eliminarArchivosDigitalesExpedienteAprobado(expedienteId) {
    const eid = Number(expedienteId);
    if (!Number.isInteger(eid) || eid <= 0) {
        return { documentos: 0, archivos: 0 };
    }

    const docRows = await indiceRepo.getDocumentosByExpedienteId(eid);
    let filesRemoved = 0;
    for (const row of docRows) {
        const did = Number(row.id);
        if (!Number.isInteger(did) || did <= 0) continue;

        const signed = await metadatoRepo.getMap(did);
        const sp = signed?.SIGNED_PDF_CURRENT;
        if (sp) {
            safeUnlinkFile(toAbsProjectPath(sp));
            filesRemoved += 1;
        }

        const doc = await documentoRepo.findById(did);
        if (doc?.contenido) {
            const c = String(doc.contenido).trim();
            if (c && !c.startsWith("<") && (c.includes("uploads") || path.extname(c))) {
                safeUnlinkFile(toAbsProjectPath(c));
            }
        }

        const anexos = await documentoAnexoRepo.listByDocumento(did);
        for (const a of anexos) {
            if (a.ruta_archivo) {
                safeUnlinkFile(toAbsProjectPath(a.ruta_archivo));
            }
        }

        const [vers] = await pool.query(
            `SELECT id, contenido FROM Version_Documento WHERE documento_id = ?`,
            [did]
        );
        for (const v of vers) {
            if (v.contenido) {
                const cc = String(v.contenido).trim();
                if (cc && !cc.startsWith("<") && (cc.includes("uploads") || path.extname(cc))) {
                    safeUnlinkFile(toAbsProjectPath(cc));
                }
            }
        }
        if (vers.length) {
            await pool.query(
                `UPDATE Version_Documento SET contenido = ? WHERE documento_id = ?`,
                ["[ELIMINADO_FISICO_HU032]", did]
            );
        }

        if (anexos.length) {
            for (const a of anexos) {
                await documentoAnexoRepo.deleteById(a.id);
            }
        }

        await documentoRepo.update(did, {
            estado: "ELIMINACION",
            contenido: "",
        });
    }

    return { documentos: docRows.length, archivos: filesRemoved };
}

function formatTamano(bytes) {
    if (bytes == null || !Number.isFinite(Number(bytes))) return "—";
    const n = Number(bytes);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Misma información que alimenta las actas: por documento, hash, tamaño y fechas.
 */
export async function recolectarFilasActaDesdeExpediente(expediente, docs) {
    const out = [];
    for (const d of docs) {
        const did = Number(d.id);
        let sizeBytes = null;
        let hash = d.contenido_hash != null ? String(d.contenido_hash) : "—";
        try {
            const { buffer } = await documentoService.getPdfBufferForConsultaPreview({ documento_id: did });
            if (Buffer.isBuffer(buffer)) {
                sizeBytes = buffer.length;
            }
        } catch {
            // sin PDF exportable: tamaño 0
            sizeBytes = 0;
        }
        const fechaDoc = d.fecha
            ? new Date(d.fecha).toLocaleDateString("es-CR")
            : "—";
        out.push({
            serie_documental: expediente.serie_nombre ?? "—",
            subserie: expediente.subserie_nombre != null ? String(expediente.subserie_nombre) : "—",
            expediente: expediente.codigo ?? "—",
            nombre: expediente.nombre ?? "—",
            titulo: d.titulo ?? "—",
            fecha_documento: fechaDoc,
            hash,
            tamano_archivo: formatTamano(sizeBytes),
            vigencia_definida: expediente.fecha_vencimiento
                ? new Date(expediente.fecha_vencimiento).toLocaleDateString("es-CR")
                : "—",
            condiciones_acceso: d.confid_level
                ? mapConfid(d.confid_level)
                : "Conforme al documento",
        });
    }
    return out;
}

function mapConfid(level) {
    const u = String(level).toUpperCase();
    if (u === "PUBLIC") return "Público (según metadato)";
    if (u === "CONFIDENTIAL" || u === "RESTRICTED") return "Reservado / restringido";
    return "Interno";
}

/**
 * Suma aproximada de bytes de PDFs exportables (transferencia / ZIP).
 */
export async function totalBytesPdfsExpediente(docs) {
    let total = 0;
    for (const d of docs) {
        const did = Number(d?.id);
        if (!Number.isInteger(did) || did <= 0) continue;
        try {
            const { buffer } = await documentoService.getPdfBufferForConsultaPreview({ documento_id: did });
            if (Buffer.isBuffer(buffer)) total += buffer.length;
        } catch {
            /* empty */
        }
    }
    return total;
}

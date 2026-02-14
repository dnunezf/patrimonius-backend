// src/services/firmaExternalVerification.service.js
import { pool } from "../db/pool.js";
import { firmaExternalVerificationRepo } from "../repositories/firmaExternalVerificationRepo.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { notificacionService } from "./notificacion.service.js";

const VALIDATOR_URL = process.env.SIGN_VALIDATOR_URL; // ej: https://validator.institucion/verify
const VALIDATOR_API_KEY = process.env.SIGN_VALIDATOR_API_KEY || "";

function requireEnv() {
    if (!VALIDATOR_URL) {
        throw Object.assign(
            new Error("Falta SIGN_VALIDATOR_URL para el validador de firmas"),
            { code: 500 }
        );
    }
}

/**
 * Cliente simple a un validador externo confiable.
 * - NO implementa criptografía acá (eso sería pesado).
 * - Se integra con un servicio oficial/tercero (según tu profe/requisito).
 */
// async function callValidator({ docBuffer, certBuffer, docName, certName }) {
//     requireEnv();
//
//     // Node 18+ tiene fetch global; si no, usá undici.
//     const fd = new FormData();
//     fd.append(
//         "document",
//         new Blob([docBuffer]),
//         docName || "documento.pdf"
//     );
//     fd.append(
//         "certificate",
//         new Blob([certBuffer]),
//         certName || "certificado.cer"
//     );
//
//     const res = await fetch(VALIDATOR_URL, {
//         method: "POST",
//         headers: {
//             ...(VALIDATOR_API_KEY ? { Authorization: `Bearer ${VALIDATOR_API_KEY}` } : {}),
//         },
//         body: fd,
//     });
//
//     if (!res.ok) {
//         const text = await res.text().catch(() => "");
//         throw Object.assign(new Error(`Validador falló (${res.status}). ${text}`), {
//             code: 502,
//         });
//     }
//
//     // Esperamos algo así:
//     // { status: "VALID"|"EXPIRED"|"REVOKED"|"INVALID", reason: "...", certificate: {...} }
//     const data = await res.json();
//
//     return data;
// }

async function callValidator({ docBuffer, certBuffer, docName, certName }) {
    // ✅ MOCK solo para DEV cuando NO hay validador configurado
    const isDev = (process.env.NODE_ENV || "development") !== "production";
    if (!VALIDATOR_URL && isDev) {
        // Reglas simples para simular distintos estados:
        // - Si el nombre del certificado contiene "invalid" => INVALID
        // - Si contiene "revoked" => REVOKED
        // - Si contiene "expired" => EXPIRED
        // - Si no, => VALID
        const cn = String(certName || "").toLowerCase();

        const status =
            cn.includes("revoked") ? "REVOKED" :
                cn.includes("expired") ? "EXPIRED" :
                    cn.includes("invalid") ? "INVALID" :
                        "VALID";

        return {
            status,
            reason: `MOCK DEV: ${status} (no hay SIGN_VALIDATOR_URL configurada)`,
            certificate: {
                serial: "MOCK-SERIAL-001",
                issuer: "MOCK-ISSUER",
                subject: "MOCK-SUBJECT",
                notBefore: "2026-01-01T00:00:00Z",
                notAfter: "2027-01-01T00:00:00Z",
            },
        };
    }
// ✅ En prod o si sí hay URL, se exige config real
    requireEnv();

    const fd = new FormData();
    fd.append("document", new Blob([docBuffer]), docName || "documento.pdf");
    fd.append("certificate", new Blob([certBuffer]), certName || "certificado.cer");

    const res = await fetch(VALIDATOR_URL, {
        method: "POST",
        headers: {
            ...(VALIDATOR_API_KEY ? { Authorization: `Bearer ${VALIDATOR_API_KEY}` } : {}),
        },
        body: fd,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw Object.assign(new Error(`Validador falló (${res.status}). ${text}`), {
            code: 502,
        });
    }

    return await res.json();
}

function mapValidatorStatusToDb(status) {
    const v = String(status || "").toUpperCase();

    if (v === "VALID" || v === "VALIDA") return "VALIDA";
    if (v === "EXPIRED" || v === "CADUCADA") return "CADUCADA";
    if (v === "REVOKED" || v === "REVOCADA") return "REVOCADA";
    return "INVALIDA";
}

async function updateDocumentoVerification(documentoId, estado) {
    const sql = `
    UPDATE Documento
    SET verificacion_firma_estado = ?, verificacion_firma_fecha = NOW()
    WHERE id = ?
  `;
    await pool.query(sql, [estado, documentoId]);
}

async function getDocumento(documentoId) {
    const [rows] = await pool.query(`SELECT * FROM Documento WHERE id = ?`, [
        documentoId,
    ]);
    return rows?.[0] ?? null;
}

async function auditFirmaExterna({
                                     accion,
                                     resultado,
                                     usuario_id,
                                     documento_id,
                                     detalle,
                                 }) {
    try {
        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion,
            resultado,
            usuario_id,
            documento_id: documento_id ?? null,
        });

        // Opción A (recomendada): si tenés insertSeguridad en tu repo
        if (typeof bitacoraRepo.insertSeguridad === "function") {
            await bitacoraRepo.insertSeguridad({
                id: baseId,
                tipo_evento: "ACTIVIDAD_SEGURIDAD",
                ip: null,
                user_agent: null,
                detalle: JSON.stringify(detalle ?? {}),
            });
            return baseId;
        }

        // Opción B (fallback): si NO tenés insertSeguridad, usamos actividad
        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: "OTRA",
            recurso: "FIRMA_EXTERNA",
            parametros: JSON.stringify(detalle ?? {}),
        });

        return baseId;
    } catch (e) {
        console.warn("⚠️ No se pudo registrar bitácora firma externa:", e.message);
        return null;
    }
}


export const firmaExternalVerificationService = {
    /**
     * Verifica firma externa para un documento.
     * @param {number} documentoId
     * @param {object} files { documentFile, certificateFile }
     * @param {object} actor usuario logueado (req.user)
     */
    async verify(documentoId, files, actor) {
        const doc = await getDocumento(documentoId);
        if (!doc) throw Object.assign(new Error("Documento no encontrado"), { code: 404 });

        if (!files?.documentFile || !files?.certificateFile) {
            await auditFirmaExterna({
                accion: "VERIFICAR_FIRMA_EXTERNA",
                resultado: "DENEGADO",
                usuario_id: actor?.id ?? null,
                documento_id: Number(documentoId),
                detalle: {
                    motivo: "FALTAN_ARCHIVOS",
                    documentoId: Number(documentoId),
                    actorId: actor?.id ?? null,
                },
            });

            throw Object.assign(new Error("Faltan archivos: documento y certificado"), { code: 400 });
        }


        const docBuffer = files.documentFile.buffer;
        const certBuffer = files.certificateFile.buffer;

        let result;
        try {
            result = await callValidator({
                docBuffer,
                certBuffer,
                docName: files.documentFile.originalname,
                certName: files.certificateFile.originalname,
            });
        } catch (err) {
            await auditFirmaExterna({
                accion: "VERIFICAR_FIRMA_EXTERNA",
                resultado: "DENEGADO",
                usuario_id: actor?.id ?? null,
                documento_id: Number(documentoId),
                detalle: {
                    motivo: "VALIDADOR_FALLA",
                    mensaje: err?.message ?? null,
                },
            });
            throw err;
        }


        const estado = mapValidatorStatusToDb(result?.status);

        await auditFirmaExterna({
            accion: "VERIFICAR_FIRMA_EXTERNA",
            resultado: "PERMITIDO",
            usuario_id: actor?.id ?? null,
            documento_id: Number(documentoId),
            detalle: {
                documentoId: Number(documentoId),
                actorId: actor?.id ?? null,
                estado,
                reason: result?.reason ?? null,
            },
        });


        // Guardar historial
        const row = await firmaExternalVerificationRepo.create({
            documento_id: Number(documentoId),
            verificado_por_usuario_id: actor?.id ?? null,
            estado,
            certificado_serial: result?.certificate?.serial ?? null,
            certificado_issuer: result?.certificate?.issuer ?? null,
            certificado_subject: result?.certificate?.subject ?? null,
            certificado_not_before: result?.certificate?.notBefore ?? null,
            certificado_not_after: result?.certificate?.notAfter ?? null,
            detalle: {
                reason: result?.reason ?? null,
                raw: result ?? null,
            },
        });

        // Cache en Documento
        await updateDocumentoVerification(documentoId, estado);
        if (estado !== "VALIDA") {
            try {
                await notificacionService.notifyFirmaExternaInvalida({
                    documentoId: Number(documentoId),
                    estado,
                    actorId: actor?.id ?? null,
                    ownerUserId: doc.usuario_id, // creador
                    reason: result?.reason ?? null,
                    link: `/editor/document/${Number(documentoId)}/edit`,
                });
            } catch (e) {
                console.warn("⚠️ No se pudo enviar notificación firma externa inválida:", e.message);
            }
        }

        return {
            ok: true,
            documento_id: Number(documentoId),
            estado,
            verificacion_id: row.id,
            detalle: {
                reason: result?.reason ?? null,
                certificate: result?.certificate ?? null,
            },
        };
    },

    async latest(documentoId) {
        return firmaExternalVerificationRepo.latestByDocumentoId(Number(documentoId));
    },

    async history(documentoId, opts) {
        return firmaExternalVerificationRepo.listByDocumentoId(Number(documentoId), opts);
    },
};

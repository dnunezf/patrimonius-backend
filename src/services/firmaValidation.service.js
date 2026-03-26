import { firmaService } from "./firma.service.js";
import { pool } from "../db/pool.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { notificacionService } from "./notificacion.service.js";
import { documentoRepo } from "../repositories/documentoRepo.js";

const ESTADOS_ALERTA = ["INVALIDA", "CADUCADA", "REVOCADA"];

async function safeAuditVerification({ usuario_id, documento_id, estado, detalle }) {
    try {
        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: "VERIFICAR_FIRMA_DIGITAL",
            resultado: estado,
            usuario_id,
            documento_id: documento_id ?? null,
        });

        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: "FIRMA",
            detalle: JSON.stringify(detalle ?? {}),
        });

        return baseId;
    } catch (err) {
        console.error("No se pudo registrar bitacora de validacion de firma:", err);
        return null;
    }
}

async function persistVerificationResult(documentoId, estadoVerificacion) {
    await pool.query(
        `
        UPDATE Documento
        SET verificacion_firma_estado = ?, verificacion_firma_fecha = NOW()
        WHERE id = ?
        `,
        [estadoVerificacion, Number(documentoId)]
    );
}

async function notifyInvalidSignature({
                                          documento_id,
                                          usuario_id,
                                          estadoVerificacion,
                                          mensaje,
                                      }) {
    if (!ESTADOS_ALERTA.includes(estadoVerificacion)) {
        return { alertaEnviada: false, destinatarioAlerta: null, emailSent: [] };
    }

    try {
        const doc = documento_id && Number.isFinite(documento_id)
            ? await documentoRepo.findById(documento_id)
            : null;
        const ownerUserId = doc?.usuario_id ?? null;

        const { notified, emailSent } = await notificacionService.notifyFirmaInvalidaArchivo({
            documentoId: documento_id ?? null,
            estado: estadoVerificacion,
            ownerUserId,
            actorId: usuario_id,
            reason: mensaje,
            mensajeBccr: mensaje,
            link: documento_id ? `/editor/document/${documento_id}/edit` : undefined,
        });

        return {
            alertaEnviada: notified > 0,
            destinatarioAlerta: ownerUserId,
            emailSent: emailSent || [],
        };
    } catch (e) {
        console.warn("No se pudo generar alerta por firma invalida:", e?.message);
        return { alertaEnviada: false, destinatarioAlerta: null, emailSent: [] };
    }
}

async function validateUploadedDocument({ file, body, actor }) {
    if (!file || !file.buffer) {
        const error = new Error("No se recibio ningun archivo en el campo 'file'");
        error.code = 400;
        error.type = "no_file";
        throw error;
    }

    const usuario_id = actor?.id ?? null;
    const documentoIdRaw = body?.documentoId ?? body?.documento_id ?? null;
    const documento_id = documentoIdRaw ? Number(documentoIdRaw) : null;
    const pdfBuffer = file.buffer;

    try {
        const result = await firmaService.validarFirmaPDF(pdfBuffer);
        const estadoVerificacion = result.estadoVerificacion || "INVALIDA";

        if (documento_id && Number.isFinite(documento_id)) {
            await persistVerificationResult(documento_id, estadoVerificacion);
        }

        await safeAuditVerification({
            usuario_id,
            documento_id,
            estado: result.valido ? "PERMITIDO" : "DENEGADO",
            detalle: {
                accion_solicitada: "VERIFICAR_FIRMA_DIGITAL",
                estadoVerificacion,
                valido: result.valido,
                mensaje: result.mensaje,
                totalFirmas: Array.isArray(result.firmas) ? result.firmas.length : 0,
            },
        });

        const { alertaEnviada, destinatarioAlerta, emailSent } = await notifyInvalidSignature({
            documento_id,
            usuario_id,
            estadoVerificacion,
            mensaje: result.mensaje,
        });

        return {
            status: 200,
            data: {
                ...result,
                alertaEnviada,
                destinatarioAlerta,
                correosEnviados: emailSent?.length ?? 0,
                correosEnviadosA: emailSent || [],
            },
        };
    } catch (err) {
        if (err?.message === "sin firma") {
            return {
                status: 422,
                data: {
                    error: "sin_firma",
                    message: "El PDF no contiene una firma digital valida",
                },
            };
        }

        const status = err?.code === 400 ? 400 : 500;

        return {
            status,
            data: {
                error: err?.message || "error_validacion",
                message: err?.message || "Error validando la firma",
            },
        };
    }
}

export const firmaValidationService = {
    validateUploadedDocument,
};
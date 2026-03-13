// src/controllers/firma.controller.js
import { firmaService } from "../services/firma.service.js";
import { pool } from "../db/pool.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { notificacionService } from "../services/notificacion.service.js";
import { documentoRepo } from "../repositories/documentoRepo.js";

// export async function validarDocumento(req, res) {
//     try {
//         if (!req.file || !req.file.buffer) {
//             return res.status(400).json({ error: "no_file", message: "No se recibió ningún archivo en el campo 'file'" });
//         }
//
//         const pdfBuffer = req.file.buffer;
//         try {
//             const result = await firmaService.validarFirmaPDF(pdfBuffer);
//             return res.status(200).json(result);
//         } catch (err) {
//             if (err?.message === "sin firma") {
//                 return res.status(422).json({ error: "sin_firma", message: "El PDF no contiene una firma digital válida" });
//             }
//             const status = err?.code === 400 ? 400 : 500;
//             return res.status(status).json({ error: err?.message || "error_validacion", message: err?.message || "Error validando la firma" });
//         }
//     } catch (e) {
//         return res.status(500).json({ error: "internal_error", message: e?.message });
//     }
// }

async function safeAuditVerification({ usuario_id, documento_id, estado, detalle }) {
    try {
        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: "VERIFICAR_FIRMA_DIGITAL",
            resultado: estado,
            usuario_id,
            documento_id: documento_id ?? null,
        });

        if (bitacoraRepo.insertSeguridad) {
            await bitacoraRepo.insertSeguridad({
                id: baseId,
                tipo_evento: "ACTIVIDAD_SEGURIDAD",
                ip: null,
                user_agent: null,
                detalle: JSON.stringify(detalle ?? {}),
            });
        } else {
            await bitacoraRepo.insertActividad({
                id: baseId,
                actividad: "OTRA",
                recurso: "FIRMA_DIGITAL",
                parametros: JSON.stringify(detalle ?? {}),
            });
        }
    } catch (err) {
        console.warn("⚠️ No se pudo registrar bitácora de validación de firma:", err?.message);
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

export async function validarDocumento(req, res) {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                error: "no_file",
                message: "No se recibió ningún archivo en el campo 'file'",
            });
        }

        const actor = req.user ?? req.actor ?? null;
        const usuario_id = actor?.id ?? null;
        const documentoIdRaw = req.body?.documentoId ?? req.body?.documento_id ?? null;
        const documento_id = documentoIdRaw ? Number(documentoIdRaw) : null;

        const pdfBuffer = req.file.buffer;

        try {
            const result = await firmaService.validarFirmaPDF(pdfBuffer);
            const estadoVerificacion = result.estadoVerificacion || "INVALIDA";

            let alertaEnviada = false;
            let destinatarioAlerta = null;

            // 1) Persistir estado en Documento si viene documentoId
            if (documento_id && Number.isFinite(documento_id)) {
                await persistVerificationResult(documento_id, estadoVerificacion);
            }

            // 2) Bitácora
            await safeAuditVerification({
                usuario_id,
                documento_id,
                estado: estadoVerificacion,
                detalle: {
                    estadoVerificacion,
                    valido: result.valido,
                    mensaje: result.mensaje,
                    totalFirmas: Array.isArray(result.firmas) ? result.firmas.length : 0,
                },
            });

            // 3) Alertar si aplica
            if (
                documento_id &&
                Number.isFinite(documento_id) &&
                ["INVALIDA", "CADUCADA", "REVOCADA"].includes(estadoVerificacion)
            ) {
                try {
                    const doc = await documentoRepo.findById(documento_id);

                    destinatarioAlerta = doc?.email || null;

                    await notificacionService.notifyFirmaInvalidaArchivo({
                        documentoId: documento_id,
                        estado: estadoVerificacion,
                        ownerUserId: doc?.usuario_id ?? null,
                        actorId: usuario_id,
                        reason: result.mensaje,
                        link: `/editor/document/${documento_id}/edit`,
                    });

                    alertaEnviada = true;
                } catch (e) {
                    console.warn(
                        "⚠️ No se pudo generar alerta por firma inválida:",
                        e?.message
                    );
                    alertaEnviada = false;
                }
            }

            return res.status(200).json({
                ...result,
                alertaEnviada,
                destinatarioAlerta,
            });
        } catch (err) {
            if (err?.message === "sin firma") {
                return res.status(422).json({
                    error: "sin_firma",
                    message: "El PDF no contiene una firma digital válida",
                });
            }

            const status = err?.code === 400 ? 400 : 500;
            return res.status(status).json({
                error: err?.message || "error_validacion",
                message: err?.message || "Error validando la firma",
            });
        }
    } catch (e) {
        return res.status(500).json({
            error: "internal_error",
            message: e?.message,
        });
    }
}
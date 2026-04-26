import { z } from "zod";

const emailSchema = z
    .string()
    .trim()
    .email("Correo electrónico inválido")
    .transform((value) => value.toLowerCase());

export const dispatchEmailSchema = z.object({
    to: z.array(emailSchema).min(1, "Debe indicar al menos un destinatario"),
    cc: z.array(emailSchema).optional().default([]),
    subject: z
        .string()
        .trim()
        .min(3, "El asunto es obligatorio")
        .max(255, "El asunto no puede superar 255 caracteres"),
    message: z
        .string()
        .trim()
        .min(3, "El mensaje es obligatorio")
        .max(10000, "El mensaje es demasiado largo"),
    attachmentIds: z.array(z.number().int()).min(1, "Debe incluir al menos un adjunto"),
});

export function normalizeEmailsArray(value) {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .map((item) => String(item || "").trim().toLowerCase())
                .filter(Boolean),
        ),
    );
}
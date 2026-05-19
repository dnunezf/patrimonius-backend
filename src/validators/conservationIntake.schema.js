import { z } from "zod";

export const conservationConfLevelSchema = z.enum([
    "PUBLIC",
    "INTERNAL",
    "HIGH",
    "RESTRICTED",
]);

export const conservationDocumentFlowSchema = z.enum([
    "PRODUCED_SENT",
    "RECEIVED",
]);

export const conservationProcedureTypeSchema = z.enum([
    "CONOCIMIENTO",
    "ARCHIVO",
    "RESPUESTA",
    "SEGUIMIENTO",
]);

const trimmedString = z.string().trim();

const keywordArraySchema = z
    .array(trimmedString.min(1))
    .max(50)
    .optional()
    .default([]);

const signerArraySchema = z
    .array(trimmedString.min(1))
    .max(50)
    .optional()
    .default([]);

const signedAtArraySchema = z
    .array(trimmedString.min(1))
    .max(50)
    .optional()
    .default([]);

const dispatchEmailsSchema = z
    .array(trimmedString.email())
    .min(1)
    .max(20)
    .optional()
    .default([]);

export const conservationSearchSchema = z.object({
    q: trimmedString.optional().default(""),
    officialCode: trimmedString.optional().default(""),
    producingUnit: trimmedString.optional().default(""),
    dateFrom: trimmedString.optional().default(""),
    dateTo: trimmedString.optional().default(""),
    signatureState: z
        .enum(["ALL", "COMPLETE", "INCOMPLETE"])
        .optional()
        .default("ALL"),
});

export const duplicateCheckSchema = z.object({
    code: trimmedString.min(1, "Official code is required"),
});

export const referenceCodePreviewSchema = z.object({
    candidateId: z.coerce.number().int().positive(),
    documentType: trimmedString.optional().default(""),
    producingUnit: trimmedString.optional().default(""),
});

/** HU-017: solicitar firma (misma numeración que reference-code-preview). */
export const prepareSignatureSchema = z.object({
    candidateId: z.coerce.number().int().positive(),
    firmantesIds: z
        .array(z.coerce.number().int().positive())
        .min(1, "At least one signer id is required"),
    fecha_limite: z.union([z.string(), z.null()]).optional().nullable(),
});

export const conservationIntakeSchema = z
    .object({
        candidateId: z.coerce.number().int().positive(),
        officialCode: trimmedString.min(8, "Official code is incomplete"),

        metadata: z.object({
            documentFlow: conservationDocumentFlowSchema,
            documentType: trimmedString.min(1).max(150),
            title: trimmedString.min(1).max(255),
            producingUnit: trimmedString.min(1).max(180),
            keywords: keywordArraySchema,
            accessLevel: conservationConfLevelSchema,
            procedureType: conservationProcedureTypeSchema.nullable().optional(),

            sizeBytes: z.coerce.number().nonnegative().nullable().optional(),
            format: trimmedString.max(120).nullable().optional(),
            signers: signerArraySchema,
            signedAt: signedAtArraySchema,
            softwareVersion: trimmedString.max(180).nullable().optional(),
        }),

        classification: z.object({
            serieId: z.coerce.number().int().positive(),
            subserieId: z.coerce.number().int().positive().nullable().optional(),
            expedienteId: z.coerce.number().int().positive(),
            code: trimmedString.min(1).max(100),
            label: trimmedString.min(1).max(255),
        }),

        retention: z.object({
            ruleId: z.coerce.number().int().min(0),
            startDateISO: trimmedString.regex(
                /^\d{4}-\d{2}-\d{2}$/,
                "Invalid date format",
            ),
            trackingEnabled: z.literal(true),
        }),

        outgoing: z
            .object({
                recipientNameRole: trimmedString.min(1).max(255),
                recipientInstitution: trimmedString.min(1).max(255),
                dispatchEmails: dispatchEmailsSchema,
            })
            .nullable()
            .optional(),

        incoming: z
            .object({
                senderNameRole: trimmedString.max(255).nullable().optional(),
                senderInstitution: trimmedString.max(255).nullable().optional(),
            })
            .nullable()
            .optional(),
    })
    .superRefine((payload, ctx) => {
        if (payload.metadata.documentFlow === "PRODUCED_SENT") {
            if (!payload.outgoing) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["outgoing"],
                    message: "Outgoing data is required for produced/sent documents",
                });
            }
        }

        if (payload.metadata.documentFlow === "RECEIVED") {
            if (payload.outgoing) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["outgoing"],
                    message: "Outgoing data is not allowed for received documents",
                });
            }
        }
    });

export const conservationAuditSchema = z.object({
    event: trimmedString.min(1).max(120),
    detail: z.any().optional(),
});

export function normalizeKeywordsArray(arr = []) {
    return Array.from(
        new Set(
            (Array.isArray(arr) ? arr : [])
                .map((value) => String(value || "").trim())
                .filter(Boolean),
        ),
    );
}

export function normalizeEmailsArray(arr = []) {
    return Array.from(
        new Set(
            (Array.isArray(arr) ? arr : [])
                .map((value) =>
                    String(value || "")
                        .trim()
                        .toLowerCase(),
                )
                .filter(Boolean),
        ),
    );
}
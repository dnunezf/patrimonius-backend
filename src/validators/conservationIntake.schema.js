import { z } from "zod";

export const conservationConfLevelSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "HIGH",
  "RESTRICTED",
]);

export const conservationSearchSchema = z.object({
  q: z.string().trim().optional().default(""),
  officialCode: z.string().trim().optional().default(""),
  producingUnit: z.string().trim().optional().default(""),
  dateFrom: z.string().trim().optional().default(""),
  dateTo: z.string().trim().optional().default(""),
  signatureState: z
    .enum(["ALL", "COMPLETE", "INCOMPLETE"])
    .optional()
    .default("ALL"),
});

export const duplicateCheckSchema = z.object({
  code: z.string().trim().min(1, "Official code is required"),
});

export const conservationIntakeSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  officialCode: z.string().trim().min(8, "Official code is incomplete"),

  metadata: z.object({
    title: z.string().trim().min(1).max(255),
    producingUnit: z.string().trim().min(1).max(180),
    author: z.string().trim().max(255).optional().default(""),
    keywords: z.array(z.string().trim().min(1)).min(1).max(50),
    accessLevel: conservationConfLevelSchema,
  }),

  classification: z.object({
    code: z.string().trim().min(1).max(60),
    label: z.string().trim().min(1).max(180),
  }),

  retention: z.object({
    ruleId: z.coerce.number().int().positive(),
    startDateISO: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
    trackingEnabled: z.literal(true),
  }),
});

export const conservationAuditSchema = z.object({
  event: z.string().trim().min(1).max(120),
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

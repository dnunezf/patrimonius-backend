import { z } from "zod";

/**
 * Allowed confidentiality levels for archival registration.
 */
export const conservationConfLevelSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "HIGH",
  "RESTRICTED",
]);

/**
 * Search filters used by the HU-019 candidate list.
 */
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
  pdfaOnly: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v === 1;
      return String(v).toLowerCase() === "true";
    })
    .default(true),
});

/**
 * Duplicate official code check query.
 */
export const duplicateCheckSchema = z.object({
  code: z.string().trim().min(1, "Official code is required"),
});

/**
 * Main archival intake payload.
 */
export const conservationIntakeSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  officialCode: z.string().trim().min(8, "Official code is incomplete"),

  metadata: z.object({
    title: z.string().trim().min(1).max(255),
    producingUnit: z.string().trim().min(1).max(180),
    author: z.string().trim().min(1).max(255),
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

/**
 * UI audit event.
 */
export const conservationAuditSchema = z.object({
  event: z.string().trim().min(1).max(120),
  detail: z.any().optional(),
});

/**
 * Normalize and deduplicate keyword values.
 */
export function normalizeKeywordsArray(arr = []) {
  return Array.from(
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  );
}

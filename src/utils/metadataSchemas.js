// src/utils/metadataSchemas.js
import { z } from "zod";

/** Descriptive metadata schema (HU-012 + ajustes). */
export const descriptiveMetadataSchema = z.object({
  title: z.string().trim().min(1, "Required").max(255),
  author: z.string().trim().min(1, "Required").max(120),
  responsibleUnitId: z.coerce.number().int().positive(),
  // Keywords must be >= 1
  keywords: z.union([
    z.string().trim().min(1, "At least one keyword").max(2000), // CSV
    z.array(z.string().trim().min(1)).min(1, "At least one keyword").max(20), // Array
  ]),
  preliminaryClass: z.string().trim().min(1, "Required").max(150),
  classificationCode: z.string().trim().min(1, "Required").max(60),
  retentionYears: z.coerce.number().int().min(1).max(200),
  pages: z.coerce.number().int().min(1).max(10000).optional(),
});

export function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return value.map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

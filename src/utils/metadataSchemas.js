// src/utils/metadataSchemas.js
import { z } from "zod";

/** Descriptive metadata schema for HU-012. */
export const descriptiveMetadataSchema = z.object({
  title: z.string().trim().min(1, "Required").max(255),
  author: z.string().trim().min(1, "Required").max(120),
  responsibleUnitId: z.coerce.number().int().positive(),
  keywords: z
    .union([
      z.string().trim().max(2000), // CSV
      z.array(z.string().trim().min(1)).max(20),
    ])
    .optional()
    .default([]),
  preliminaryClass: z.string().trim().min(1, "Required").max(150),
});

export function normalizeKeywords(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

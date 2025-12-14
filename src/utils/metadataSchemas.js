// src/utils/metadataSchemas.js
import { z } from "zod";

/**
 * Descriptive metadata schema.
 * This schema only covers fields that are manually editable by the editor.
 * Administrative/automatic descriptive data (author, unit, etc.) is injected
 * by the backend and not validated here.
 */
export const descriptiveMetadataSchema = z.object({
  title: z.string().trim().min(1, "Required").max(255),

  // Keywords must be >= 1
  keywords: z.union([
    z.string().trim().min(1, "At least one keyword").max(2000), // CSV
    z.array(z.string().trim().min(1)).min(1, "At least one keyword").max(20), // Array
  ]),

  preliminaryClass: z.string().trim().min(1, "Required").max(150),

  // Classification code for the archival series / class
  classificationCode: z.string().trim().min(1, "Required").max(60),
});

/**
 * Normalize keywords into a trimmed string array.
 */
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

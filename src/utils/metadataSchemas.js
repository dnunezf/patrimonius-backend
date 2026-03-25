import { z } from "zod";

export const ACCESS_LEVELS = ["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"];

export const descriptiveMetadataSchema = z.object({
  documentType: z.string().trim().min(1, "Required").max(150),
  producerUnitId: z.coerce.number().int().positive("Required"),
  title: z.string().trim().min(1, "Required").max(255),

  keywords: z
    .union([
      z.string().trim().max(2000),
      z.array(z.string().trim().min(1)).max(20),
    ])
    .optional()
    .default(""),

  accessLevel: z.enum(ACCESS_LEVELS),
});

export function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return value
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  return [];
}

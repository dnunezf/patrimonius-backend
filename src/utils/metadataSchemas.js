import { z } from "zod";

export const ACCESS_LEVELS = ["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"];

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "Acta", code: "ACT" },
  { value: "Bitácora", code: "BIT" },
  { value: "Certificación", code: "CER" },
  { value: "Circular", code: "CIR" },
  { value: "Constancia", code: "CON" },
  { value: "Contrato", code: "CONT" },
  { value: "Convenio", code: "CONV" },
  { value: "Estudio", code: "EST" },
  { value: "Ficha técnica", code: "FIC" },
  { value: "Informe", code: "INF" },
  { value: "Memorando", code: "MEM" },
  { value: "Minuta de reunión", code: "MIN" },
  { value: "Oficio", code: "OFI" },
  { value: "Resolución", code: "RES" },
  { value: "Solicitud", code: "SOL" },
  { value: "Proyectos", code: "PRO" },
  { value: "Controles", code: "CONTR" },
  { value: "Planes", code: "PLAN" },
];

export const DOCUMENT_TYPES = DOCUMENT_TYPE_OPTIONS.map((item) => item.value);

export const descriptiveMetadataSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
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

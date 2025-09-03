import { z } from "zod";

export const createUserSchema = z.object({
  nombre: z.string().min(2),
  apellido1: z.string().min(2),
  apellido2: z.string().optional().default(""),
  email: z.string().email(),
  rolId: z.number().int().positive(),
  unidadId: z.number().int().positive(),
  editorPermissions: z
    .array(z.enum(["EDIT", "SIGN"]))
    .optional()
    .default([]),
});

export const updateUserSchema = createUserSchema.partial().extend({
  id: z.number().int().positive(),
});

export function validate(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    const err = new Error(msg);
    err.code = 400;
    throw err;
  }
  return parsed.data;
}

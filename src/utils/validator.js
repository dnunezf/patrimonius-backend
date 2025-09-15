import { z } from "zod";

const str2 = z.string().trim().min(2); // trims + min length

export const createUserSchema = z.object({
  nombre: str2,
  apellido1: str2,
  apellido2: z.string().trim().optional().default(""),
  email: z.string().trim().email(),
  rolId: z.coerce.number().int().positive(),
  unidadId: z.coerce.number().int().positive(),
  editorPermissions: z
    .array(z.enum(["EDIT", "SIGN"]))
    .optional()
    .default([]),
});

export const updateUserSchema = createUserSchema.partial().extend({
  id: z.coerce.number().int().positive(),
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

export const setConfidentialitySchema = z.object({
  level: z.enum(["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"]),
  users: z
    .array(
      z.object({
        userId: z.number().int().positive(),
        actions: z
          .array(z.enum(["VIEW", "EDIT", "SIGN"]))
          .optional()
          .default(["VIEW", "EDIT", "SIGN"]),
      })
    )
    .optional()
    .default([]),
  roles: z
    .array(
      z.object({
        roleId: z.number().int().positive(),
        actions: z
          .array(z.enum(["VIEW", "EDIT", "SIGN"]))
          .optional()
          .default(["VIEW", "EDIT", "SIGN"]),
      })
    )
    .optional()
    .default([]),
});

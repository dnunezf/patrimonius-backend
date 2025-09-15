import { z } from "zod";

const str2 = z.string({ required_error: "Required" }).trim().min(2, "Required"); // mantiene “Required” si viene vacío o <2

export const createUserSchema = z.object({
  nombre: str2,
  apellido1: str2,
  apellido2: z.string().trim().optional().default(""),
  email: z.string({ required_error: "Required" }).trim().email("Required"),
  rolId: z.coerce
    .number({
      required_error: "Required",
      invalid_type_error: "Required",
    })
    .int()
    .positive(),
  unidadId: z.coerce
    .number({
      required_error: "Required",
      invalid_type_error: "Required",
    })
    .int()
    .positive(),
  editorPermissions: z
    .array(z.enum(["EDIT", "SIGN"]))
    .optional()
    .default([]),
});

export const updateUserSchema = createUserSchema.partial().extend({
  id: z.coerce
    .number({
      required_error: "Required",
      invalid_type_error: "Required",
    })
    .int()
    .positive(),
});

export function validate(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Do NOT expose field-level errors to the client
    const err = new Error("invalid_request");
    err.code = 422; // Unprocessable Entity
    err.details = parsed.error.format();
    err.expose = false;
    throw err;
  }
  return parsed.data;
}

export const setConfidentialitySchema = z.object({
  level: z.enum(["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"]),
  users: z
    .array(
      z.object({
        userId: z.coerce.number().int().positive(),
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
        roleId: z.coerce.number().int().positive(),
        actions: z
          .array(z.enum(["VIEW", "EDIT", "SIGN"]))
          .optional()
          .default(["VIEW", "EDIT", "SIGN"]),
      })
    )
    .optional()
    .default([]),
});

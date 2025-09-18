// src/utils/validator.js
import { z } from "zod";

/** Common primitives */
const str2 = z.string({ required_error: "Required" }).trim().min(2, "Required");
const posInt = z.coerce
  .number({ required_error: "Required", invalid_type_error: "Required" })
  .int()
  .positive();

/**
 * Base object (no transforms). We use this for both create and update so
 * we can call `.partial()` on the ZodObject. Transforms are applied
 * on top of this base when needed.
 */
const baseUserObject = z.object({
  nombre: str2,
  apellido1: str2,
  apellido2: z.string().trim().optional().default(""),
  email: z.string({ required_error: "Required" }).trim().email("Required"),

  // NEW: accept legacy single role OR multiple roles
  rolId: posInt.optional(),
  rolIds: z.array(posInt).optional().default([]),

  unidadId: posInt,
  editorPermissions: z
    .array(z.enum(["EDIT", "SIGN"]))
    .optional()
    .default([]),
});

/**
 * CREATE schema:
 * - requires at least one role (rolId or rolIds[])
 * - normalizes to always have { rolId: first, rolIds: unique[] }
 */
export const createUserSchema = baseUserObject
  .superRefine((d, ctx) => {
    const hasAny =
      !!d.rolId || (Array.isArray(d.rolIds) && d.rolIds.length > 0);
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required",
        path: ["rolIds"],
      });
    }
  })
  .transform((d) => {
    const ids = (d.rolIds?.length ? d.rolIds : d.rolId != null ? [d.rolId] : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    const uniq = Array.from(new Set(ids));
    return { ...d, rolId: uniq[0], rolIds: uniq };
  });

/**
 * UPDATE schema:
 * - all fields optional (+ id required)
 * - if rolIds is provided, we auto-populate rolId with the first one (compat)
 *   but we do NOT enforce "at least one" like in create.
 */
const updateBase = baseUserObject.partial().extend({
  id: posInt,
});

export const updateUserSchema = updateBase.transform((d) => {
  if (Array.isArray(d.rolIds) && d.rolIds.length && d.rolId == null) {
    return { ...d, rolId: Number(d.rolIds[0]) };
  }
  return d;
});

/** Safe validator that hides field-level details from clients. */
export function validate(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const err = new Error("invalid_request");
    err.code = 422; // Unprocessable Entity
    err.details = parsed.error.format();
    err.expose = false;
    throw err;
  }
  return parsed.data;
}

/** (unchanged) */
export const setConfidentialitySchema = z.object({
  level: z.enum(["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"]),
  users: z
    .array(
      z.object({
        userId: posInt,
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
        roleId: posInt,
        actions: z
          .array(z.enum(["VIEW", "EDIT", "SIGN"]))
          .optional()
          .default(["VIEW", "EDIT", "SIGN"]),
      })
    )
    .optional()
    .default([]),
});

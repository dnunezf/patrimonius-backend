//src/validators/confidentialiyu.schema.js
import { z } from "zod";

export const ConfLevelSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "HIGH",
  "RESTRICTED",
]);
export const ActionSchema = z.enum(["VIEW", "EDIT", "SIGN"]);

export const ConfUserEntrySchema = z.object({
  userId: z.number().int().positive(),
  actions: z.array(ActionSchema).min(1),
});

export const ConfRoleEntrySchema = z.object({
  roleId: z.number().int().positive(),
  actions: z.array(ActionSchema).min(1),
});

export const SetConfidentialitySchema = z
  .object({
    level: ConfLevelSchema,
    users: z.array(ConfUserEntrySchema).default([]),
    roles: z.array(ConfRoleEntrySchema).default([]),
  })
  .superRefine((v, ctx) => {
    const sensitive = v.level !== "PUBLIC";
    if (sensitive && v.users.length + v.roles.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Sensitive levels require at least one authorized user or role.",
        path: ["users"],
      });
    }
  });

export function normalizeActions(arr) {
  const set = new Set();
  for (const a of Array.isArray(arr) ? arr : []) {
    if (a === "VIEW" || a === "EDIT" || a === "SIGN") set.add(a);
  }
  return [...set];
}

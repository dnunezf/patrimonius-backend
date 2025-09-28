// src/routes/adminUsers.routes.js

import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import {
  validate,
  createUserSchema,
  updateUserSchema,
} from "../utils/validator.js";
import { userService } from "../services/userService.js";
import { rolService } from "../services/rolService.js"; 

export const adminUsers = Router();

// Apply admin-only guard to every route under /admin/*
adminUsers.use(adminGuard);

/** Map DB/validation errors to HTTP status codes. */
function mapStatus(err) {
  if (err === 404 || err?.code === 404) return 404; // not found
  if (err === 400 || err?.code === 400) return 400; // bad request (manual)
  if (err?.code === 422) return 422;                // zod validation masked
  switch (err?.code) {
    case "ER_DUP_ENTRY":          // unique key violation
      return 409;
    case "ER_NO_REFERENCED_ROW_2": // FK missing
      return 400;
    case "ER_ROW_IS_REFERENCED_2": // FK referenced
      return 409;
    default:
      return 500;
  }
}

/** Centralized error responder to avoid leaking field-level messages.
 *  - 422 (validation): return a generic error only
 *  - 409 (conflict):   return a generic error only
 *  - others:           keep a compact error code without message
 */
function sendError(res, e) {
  const status = mapStatus(e);
  if (status === 422) {
    // Mask Zod details: the frontend must not see "nombre: Required; ...".
    return res.status(422).json({ error: "invalid_request" });
  }
  if (status === 409) {
    // Hide DB internals like "Duplicate entry ..." to avoid noisy warnings.
    return res.status(409).json({ error: "conflict" });
  }
  // Keep responses terse; omit e.message to prevent surfacing internals.
  return res.status(status).json({ error: e.code || "internal_error" });
}

/** Create user with optional editor permissions. */
adminUsers.post("/users", async (req, res) => {
  try {
    // Validate and coerce payload (numbers may come as strings)
    const dto = validate(createUserSchema, req.body);
    const data = await userService.create(dto, req.actor);
    res.status(201).json(data);
  } catch (e) {
    sendError(res, e);
  }
});

/** List users for admin dashboard (optional search by name/email with ?search=). */
adminUsers.get("/users", async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const list = search ? await userService.search(search) : await userService.list();
    res.json(list);
  } catch (e) {
    sendError(res, e);
  }
});

/** Get roles (utility for frontend selects). */
adminUsers.get("/roles", async (_req, res) => {
  try {
    const roles = await rolService.getAllRoles();
    res.json(roles);
  } catch (e) {
    sendError(res, e);
  }
});

/** Patch user data and permissions. */
adminUsers.patch("/users/:id", async (req, res) => {
  try {
    // Normalize id and validate the rest of fields
    const dto = validate(updateUserSchema, {
      ...req.body,
      id: Number(req.params.id),
    });
    const data = await userService.update(dto.id, dto, req.actor);
    res.json(data);
  } catch (e) {
    sendError(res, e);
  }
});

/** Delete user. */
adminUsers.delete("/users/:id", async (req, res) => {
  try {
    await userService.remove(Number(req.params.id), req.actor);
    res.status(204).send();
  } catch (e) {
    sendError(res, e);
  }
});

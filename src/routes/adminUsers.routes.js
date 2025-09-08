import { Router } from "express";
import { adminGuard } from "../middleware/adminGuard.js";
import {
  validate,
  createUserSchema,
  updateUserSchema,
} from "../utils/validator.js";
import { userService } from "../services/userService.js";

/** Maps MySQL errors to valid HTTP status codes. */
function mapStatus(err) {
  if (err === 404 || err?.code === 404) return 404; // not found
  if (err === 400 || err?.code === 400) return 400; // zod
  switch (err?.code) {
    case "ER_DUP_ENTRY":
      return 409;
    case "ER_NO_REFERENCED_ROW_2":
      return 400;
    case "ER_ROW_IS_REFERENCED_2":
      return 409;
    default:
      return 500;
  }
}

export const adminUsers = Router();
adminUsers.use(adminGuard);

/** Create user with optional editor permissions. */
adminUsers.post("/users", async (req, res) => {
  try {
    const dto = validate(createUserSchema, req.body);
    const data = await userService.create(dto, req.actor);
    res.status(201).json(data);
  } catch (e) {
    res
      .status(mapStatus(e))
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

/** List users for admin dashboard. */
adminUsers.get("/users", async (_req, res) => {
  try {
    const list = await userService.list();
    res.json(list);
  } catch (e) {
    res
      .status(mapStatus(e))
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

/** Patch user data and permissions. */
adminUsers.patch("/users/:id", async (req, res) => {
  try {
    const dto = validate(updateUserSchema, {
      ...req.body,
      id: Number(req.params.id),
    });
    const data = await userService.update(dto.id, dto, req.actor);
    res.json(data);
  } catch (e) {
    res
      .status(mapStatus(e))
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

/** Delete user. */
adminUsers.delete("/users/:id", async (req, res) => {
  try {
    await userService.remove(Number(req.params.id), req.actor);
    res.status(204).send();
  } catch (e) {
    res
      .status(mapStatus(e))
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

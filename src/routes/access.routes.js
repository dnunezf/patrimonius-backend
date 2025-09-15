import { Router } from "express";
import { authGuard } from "../middleware/authGuard.js";
import { accessService } from "../services/accessService.js";

/**
 * Public API for runtime checks.
 * This route is meant to be called by other modules before VIEW/EDIT/SIGN actions.
 */
export const accessRoutes = Router();
accessRoutes.use(authGuard);

/** POST /access/check  { documentId, action } -> { allowed, level, reason } */
accessRoutes.post("/check", async (req, res) => {
  try {
    const { documentId, action } = req.body || {};
    const check = await accessService.checkAccess(
      { documentId: Number(documentId), action, user: req.user },
      req.ip,
      req.headers["user-agent"]
    );
    res.json(check);
  } catch (e) {
    res
      .status(e.code || 500)
      .json({ error: e.code || "internal_error", message: e.message });
  }
});

export default accessRoutes;

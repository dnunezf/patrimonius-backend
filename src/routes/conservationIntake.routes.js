import { Router } from "express";
import { conservationIntakeController } from "../controllers/conservationIntake.controller.js";

/**
 * Routes for HU-019 archival conservation intake.
 * Mounted under /admin.
 */
export function buildConservationIntakeRoutes() {
  const router = Router();

  router.get(
    "/conservation/candidates",
    conservationIntakeController.searchCandidates,
  );

  router.get(
    "/conservation/duplicate-check",
    conservationIntakeController.checkDuplicateOfficialCode,
  );

  router.get(
    "/conservation/retention-rules",
    conservationIntakeController.listRetentionRules,
  );

  router.post(
    "/conservation/intakes",
    conservationIntakeController.registerIntake,
  );

  router.post("/conservation/audit", conservationIntakeController.audit);

  return router;
}

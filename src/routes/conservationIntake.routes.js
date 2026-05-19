import { Router } from "express";
import { conservationIntakeController } from "../controllers/conservationIntake.controller.js";

/**
 * Routes for conservation intake.
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
    "/conservation/reference-code-preview",
    conservationIntakeController.previewReferenceCode,
  );

  router.post(
    "/conservation/prepare-signature",
    conservationIntakeController.prepareDocumentSignature,
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

  // =========================
  // HU-035 · EAD 2002 export
  // =========================
  router.get(
    "/conservation/ead/documents",
    conservationIntakeController.listEadDocuments,
  );

  router.get(
    "/conservation/ead/documents/:id/preview",
    conservationIntakeController.previewEadExport,
  );

  router.post(
    "/conservation/ead/documents/:id/export",
    conservationIntakeController.downloadEadXml,
  );

  return router;
}

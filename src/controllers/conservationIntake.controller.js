import { ZodError } from "zod";
import { conservationIntakeService } from "../services/conservationIntake.service.js";

function sendKnownError(res, error) {
  const code = error?.code || "INTERNAL_ERROR";

  if (error instanceof ZodError) {
    return res.status(422).json({
      error: "validation_error",
      message: "Validation failed",
      issues: error.issues,
    });
  }

  switch (code) {
    case "UNAUTHORIZED":
      return res
        .status(401)
        .json({ error: "unauthorized", message: error.message });

    case "NOT_FOUND":
      return res
        .status(404)
        .json({ error: "not_found", message: error.message });

    case "DUPLICATE_OFFICIAL_CODE":
      return res.status(409).json({
        error: "duplicate_official_code",
        message: error.message,
        ...(error.extra || {}),
      });

    case "DUPLICATE_CONSERVATION_DOCUMENT":
      return res.status(409).json({
        error: "duplicate_conservation_document",
        message: error.message,
      });

    case "INCOMPLETE_OFFICIAL_CODE":
      return res.status(400).json({
        error: "incomplete_official_code",
        message: error.message,
      });

    case "OFFICIAL_CODE_MISMATCH":
      return res.status(400).json({
        error: "official_code_mismatch",
        message: error.message,
      });

    case "INVALID_CLASSIFICATION":
      return res.status(400).json({
        error: "invalid_classification",
        message: error.message,
      });

    case "INVALID_RETENTION_RULE":
      return res.status(400).json({
        error: "invalid_retention_rule",
        message: error.message,
      });

    case "INVALID_ARCHIVAL_STRUCTURE":
      return res.status(400).json({
        error: "invalid_archival_structure",
        message: error.message,
      });

    case "INCOMPLETE_ARCHIVAL_METADATA":
      return res.status(400).json({
        error: "incomplete_archival_metadata",
        message: error.message,
      });

    default:
      return res.status(error?.status || 500).json({
        error: "internal_error",
        message: error?.message || "Unexpected server error",
      });
  }
}

export const conservationIntakeController = {
  async searchCandidates(req, res) {
    try {
      const rows = await conservationIntakeService.searchCandidates(req.query);
      return res.json(rows);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  async checkDuplicateOfficialCode(req, res) {
    try {
      const out = await conservationIntakeService.checkDuplicateOfficialCode(
        req.query,
      );
      return res.json(out);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  async previewReferenceCode(req, res) {
    try {
      const out = await conservationIntakeService.previewReferenceCode(
        req.query,
      );
      return res.json(out);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  async listRetentionRules(_req, res) {
    try {
      const rules = await conservationIntakeService.listRetentionRules();
      return res.json(rules);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  async registerIntake(req, res) {
    try {
      const out = await conservationIntakeService.registerIntake(
        req.body,
        req.actor || req.user,
      );
      return res.status(201).json(out);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  async audit(req, res) {
    try {
      const out = await conservationIntakeService.audit(
        req.body,
        req.actor || req.user,
      );
      return res.json(out);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },
};

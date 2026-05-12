import { ZodError } from "zod";
import { conservationIntakeService } from "../services/conservationIntake.service.js";
import { documentoService } from "../services/documento.service.js";
import { prepareSignatureSchema } from "../validators/conservationIntake.schema.js";

/** @returns {{ status: number; body: Record<string, unknown> } | null} */
function prepareSignatureUserFacingResponse(error) {
  if (error instanceof ZodError) {
    const paths = error.issues.map((i) => i.path.join("."));
    let extra = "Revise el formulario e intente de nuevo.";
    if (paths.some((p) => p.includes("firmantesIds"))) {
      extra = "Debe seleccionar al menos un firmante.";
    }
    return {
      status: 422,
      body: {
        error: "validation_error",
        message: `No se pudo enviar la solicitud de firmas. ${extra}`,
        issues: error.issues,
      },
    };
  }

  const code = error?.code;
  switch (code) {
    case "STATE_ERROR":
      return {
        status: 409,
        body: {
          error: "state_error",
          message:
            "En el estado actual del documento no se pueden asignar firmas. Solo es posible cuando está en creación, edición o firma parcial.",
        },
      };
    case "BAD_REQUEST":
      return {
        status: 400,
        body: {
          error: "bad_request",
          message:
            "Debe elegir al menos un firmante válido en la lista antes de enviar la solicitud.",
        },
      };
    case "MISSING_REQUIRED_METADATA":
      return {
        status: 400,
        body: {
          error: "missing_required_metadata",
          message:
            String(error?.message || "").trim() ||
            "Faltan datos obligatorios en «Metadatos». Complételos y guarde antes de solicitar firmas.",
        },
      };
    case "INCOMPLETE_ARCHIVAL_METADATA":
      return {
        status: 400,
        body: {
          error: "incomplete_archival_metadata",
          message:
            "Falta el tipo documental u otra información necesaria para generar el código oficial. Complete «Metadatos» y vuelva a intentarlo.",
        },
      };
    case "FORBIDDEN":
      return {
        status: 403,
        body: {
          error: "forbidden",
          message:
            "No tiene permiso para solicitar firmas sobre este documento.",
        },
      };
    case "NOT_FOUND":
      return {
        status: 404,
        body: {
          error: "not_found",
          message: "No se encontró el documento o ya no está disponible.",
        },
      };
    default:
      return null;
  }
}

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

    case "FORBIDDEN":
      return res
        .status(403)
        .json({ error: "forbidden", message: error.message });

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

    case "STATE_ERROR":
      return res.status(409).json({
        error: "state_error",
        message: error.message,
      });

    case "BAD_REQUEST":
      return res.status(400).json({
        error: "bad_request",
        message: error.message,
      });

    case "MISSING_REQUIRED_METADATA":
      return res.status(400).json({
        error: "missing_required_metadata",
        message: error.message,
      });

    case "INVALID_DOCUMENT_STATE":
      return res.status(409).json({
        error: "invalid_document_state",
        message: error.message,
      });

    case "EAD_EXPORT_NOT_ALLOWED":
      return res.status(409).json({
        error: "ead_export_not_allowed",
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
      const rows = await conservationIntakeService.searchCandidates(
        req.query,
        req.actor || req.user,
      );
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
        req.actor || req.user,
      );
      return res.json(out);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  /** HU-017: preparar documento para firma (numeración = reference-code-preview). */
  async prepareDocumentSignature(req, res) {
    try {
      const { candidateId, firmantesIds, fecha_limite } =
        prepareSignatureSchema.parse(req.body);
      const userId = Number(req.actor?.id ?? req.user?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(401).json({
          error: "unauthorized",
          message: "Sesión inválida: identidad de usuario no disponible",
        });
      }

      const result = await documentoService.prepareForSignature({
        documento_id: candidateId,
        usuario_id: userId,
        firmantesIds,
        fecha_limite: fecha_limite ?? null,
      });

      return res.json(result);
    } catch (error) {
      const friendly = prepareSignatureUserFacingResponse(error);
      if (friendly) {
        return res.status(friendly.status).json(friendly.body);
      }
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

  async listEadDocuments(req, res) {
    try {
      const rows = await conservationIntakeService.listEadDocuments(
        req.actor || req.user,
      );
      return res.json(rows);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  async previewEadExport(req, res) {
    try {
      const documentId = Number(req.params.id);
      const out = await conservationIntakeService.previewEadExport(
        documentId,
        req.actor || req.user,
      );
      return res.json(out);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },

  async downloadEadXml(req, res) {
    try {
      const documentId = Number(req.params.id);
      const out = await conservationIntakeService.exportEadXml(
        documentId,
        req.actor || req.user,
      );

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${out.fileName}"`,
      );

      return res.status(200).send(out.xml);
    } catch (error) {
      return sendKnownError(res, error);
    }
  },
};

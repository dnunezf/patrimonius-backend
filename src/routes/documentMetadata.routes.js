// src/routes/documentMetadata.routes.js
import { Router } from "express";
import { authGuard } from "../middleware/authGuard.js";
import { documentMetadataService } from "../services/documentMetadata.service.js";

export const documentMetadataRoutes = Router();
documentMetadataRoutes.use(authGuard);

/** Get combined metadata (technical + descriptive) for a document. */
documentMetadataRoutes.get("/documentos/:id/metadata", async (req, res) => {
  try {
    const documento_id = Number(req.params.id);
    const data = await documentMetadataService.readCombined(documento_id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "internal_error", message: e.message });
  }
});

/** Set descriptive metadata (HU-012). */
documentMetadataRoutes.put(
  "/documentos/:id/metadata/descriptive",
  async (req, res) => {
    try {
      const documento_id = Number(req.params.id);
      const actorId = req.user.id;
      const { title, author, responsibleUnitId, keywords, preliminaryClass } =
        req.body;

      await documentMetadataService.setDescriptive({
        documento_id,
        input: { title, author, responsibleUnitId, keywords, preliminaryClass },
        actorId,
      });

      res.json({ ok: true });
    } catch (e) {
      if (e.code === "MISSING_REQUIRED_METADATA") {
        return res
          .status(400)
          .json({ error: "missing_required_metadata", message: e.message });
      }
      if (e?.issues || e?.errors) {
        // zod style
        return res
          .status(422)
          .json({ error: "invalid_request", message: "Validation failed" });
      }
      res.status(500).json({ error: "internal_error", message: e.message });
    }
  }
);

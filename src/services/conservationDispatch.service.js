import fs from "fs";
import nodemailer from "nodemailer";

import { documentoService } from "./documento.service.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import {
  insertBitacoraExpedienteSafe,
  resolveBitacoraUsuarioId,
} from "../repositories/bitacoraExpedienteRepo.js";
import { conservationDispatchRepo } from "../repositories/conservationDispatch.repository.js";
import { userRepo } from "../repositories/userRepo.js";
import {
  dispatchEmailSchema,
  normalizeEmailsArray,
} from "../validators/conservationDispatch.schema.js";

const MAIN_DOCUMENT_ATTACHMENT_ID = -1;

const ADMIN_ROLE_ID = 1;
const EDITOR_ROLE_ID = 2;
const ARCHIVIST_ROLE_ID = 3;

const SENSITIVE_ACCESS_LEVELS = new Set([
  "HIGH",
  "RESTRICTED",
  "PRIVATE",
  "PRIVADO",
  "RESTRINGIDO",
]);

function buildError(message, code, status = 500) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function safeFileName(value, fallback = "documento") {
  const clean = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .trim();

  return clean || fallback;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeMimeType(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) return "application/pdf";
  if (raw.includes("pdf")) return "application/pdf";
  if (raw.includes("word") || raw.includes("docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (raw.includes("excel") || raw.includes("xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (raw.includes("powerpoint") || raw.includes("pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (raw.includes("xml")) return "application/xml";
  if (raw.includes("json")) return "application/json";
  if (raw.includes("zip")) return "application/zip";
  if (raw.includes("png")) return "image/png";
  if (raw.includes("jpg") || raw.includes("jpeg")) return "image/jpeg";
  if (raw.includes("/")) return raw;

  return "application/octet-stream";
}

function toBuffer(content) {
  if (!content) return null;
  if (Buffer.isBuffer(content)) return content;

  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }

  if (typeof content === "string") {
    return Buffer.from(content);
  }

  return Buffer.from(content);
}

function readFileIfExists(filePath) {
  const normalized = String(filePath || "").trim();

  if (!normalized) return null;

  const candidates = [normalized, `${process.cwd()}/${normalized}`];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate);
      }
    } catch {
      // Sigue probando la siguiente ruta.
    }
  }

  return null;
}

function normalizeRoleName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function getActorRoleIds(actor) {
  const ids = [];

  if (Array.isArray(actor?.rolIds)) ids.push(...actor.rolIds);
  if (Array.isArray(actor?.roleIds)) ids.push(...actor.roleIds);

  ids.push(actor?.rolId, actor?.roleId, actor?.rol_id, actor?.role_id);

  return Array.from(
    new Set(ids.map((value) => Number(value)).filter(Number.isFinite)),
  );
}

function getActorRoleNames(actor) {
  const values = [];

  if (Array.isArray(actor?.roles)) values.push(...actor.roles);
  if (typeof actor?.roles === "string") values.push(...actor.roles.split(","));

  values.push(
    actor?.role,
    actor?.rol,
    actor?.roleName,
    actor?.rolNombre,
    actor?.nombre_rol,
    actor?.rol_nombre,
  );

  return Array.from(new Set(values.map(normalizeRoleName).filter(Boolean)));
}

function hasAdminRole(actor) {
  const ids = getActorRoleIds(actor);
  const names = getActorRoleNames(actor);

  return (
    ids.includes(ADMIN_ROLE_ID) ||
    names.includes("ADMIN") ||
    names.includes("ADMINISTRADOR")
  );
}

function hasEditorRole(actor) {
  const ids = getActorRoleIds(actor);
  const names = getActorRoleNames(actor);

  return ids.includes(EDITOR_ROLE_ID) || names.includes("EDITOR");
}

function hasArchivistRole(actor) {
  const ids = getActorRoleIds(actor);
  const names = getActorRoleNames(actor);

  return (
    ids.includes(ARCHIVIST_ROLE_ID) ||
    names.includes("ARCHIVISTA") ||
    names.includes("ARCHIVADOR")
  );
}

function getActorUnitId(actor) {
  return Number(
    actor?.unidadId ||
      actor?.unidad_id ||
      actor?.unitId ||
      actor?.unit_id ||
      actor?.unidad?.id ||
      0,
  );
}

function isSensitiveAccessLevel(value) {
  return SENSITIVE_ACCESS_LEVELS.has(
    String(value || "")
      .trim()
      .toUpperCase(),
  );
}

async function canActorDispatchDocument(actor, documentRow) {
  const actorId = Number(actor?.id || actor?.userId || actor?.usuario_id || 0);
  if (!actorId) return false;

  if (actor?.isMaster === true || hasAdminRole(actor)) return true;

  const isEditor = hasEditorRole(actor);
  const isArchivist = hasArchivistRole(actor);

  if (!isEditor && !isArchivist) return false;

  const actorUnitId = getActorUnitId(actor);
  const documentUnitId = Number(documentRow?.unitId || 0);
  const documentCreatorId = Number(documentRow?.createdBy || 0);

  if (isEditor && (!actorUnitId || documentUnitId !== actorUnitId)) {
    return false;
  }

  if (isSensitiveAccessLevel(documentRow?.accessLevel)) {
    if (documentCreatorId === actorId) return true;

    return conservationDispatchRepo.actorHasExplicitDocumentAccess({
      documentId: Number(documentRow?.id),
      actorId,
    });
  }

  if (isArchivist) return true;

  return isEditor && actorUnitId > 0 && documentUnitId === actorUnitId;
}

async function resolveActorContact(actorId) {
  if (!actorId) {
    return {
      name: "DESCONOCIDO",
      email: null,
    };
  }

  const actor = await userRepo.findById(actorId);

  if (!actor) {
    return {
      name: "DESCONOCIDO",
      email: null,
    };
  }

  const name =
    [actor.nombre, actor.apellido1, actor.apellido2]
      .filter(Boolean)
      .join(" ")
      .trim() || `Usuario ${actorId}`;

  const email =
    actor.email ||
    actor.correo ||
    actor.correo_electronico ||
    actor.mail ||
    null;

  return {
    name,
    email: email ? String(email).trim() : null,
  };
}

async function logCycleEvent({
  actorId,
  documentId = null,
  accion,
  resultado,
  detail = {},
}) {
  const baseId = await bitacoraRepo.insertBase({
    fecha: new Date(),
    accion,
    resultado,
    usuario_id: actorId,
    documento_id: documentId,
  });

  await bitacoraRepo.insertCiclo({
    id: baseId,
    evento: "CONSERVACION",
    detalle: JSON.stringify(detail),
  });

  return baseId;
}

function createTransporter() {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    throw buildError(
      "Mail service is not configured. Check MAIL_HOST, MAIL_PORT, MAIL_USER and MAIL_PASS.",
      "MAIL_NOT_CONFIGURED",
      503,
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

function buildHtmlMessage({ message, document, sender }) {
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>");

  const senderName = escapeHtml(sender?.name || "DESCONOCIDO");
  const senderEmail = sender?.email
    ? escapeHtml(sender.email)
    : "No registrado";

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <p>${escapedMessage}</p>

      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0;" />

      <p style="font-size: 13px; color: #475569;">
        <strong>Enviado por:</strong> ${senderName}<br />
        <strong>Correo del remitente:</strong> ${senderEmail}<br />
        <strong>Sistema:</strong> Patrimonius
      </p>

      <p style="font-size: 13px; color: #64748b;">
        <strong>Documento:</strong> ${escapeHtml(document.title || "—")}<br />
        <strong>Código:</strong> ${escapeHtml(document.officialCode || "—")}
      </p>
    </div>
  `;
}

async function resolveMainPdfForEmail({ documentId, doc }) {
  const pdfPath =
    typeof conservationDispatchRepo.findDocumentPdfPath === "function"
      ? await conservationDispatchRepo.findDocumentPdfPath(documentId)
      : null;

  const pathBuffer = readFileIfExists(pdfPath);

  if (pathBuffer?.length) {
    return {
      filename: `${safeFileName(
        doc.officialCode || `documento-${doc.id}`,
        `documento-${doc.id}`,
      )}.pdf`,
      buffer: pathBuffer,
      mimeType: "application/pdf",
    };
  }

  try {
    const generated = await documentoService.getPdfBufferForConsultaPreview({
      documento_id: documentId,
    });

    if (generated?.buffer?.length) {
      return {
        filename:
          generated.filename ||
          `${safeFileName(
            doc.officialCode || `documento-${doc.id}`,
            `documento-${doc.id}`,
          )}.pdf`,
        buffer: generated.buffer,
        mimeType: "application/pdf",
      };
    }
  } catch (_error) {
    // Si no se puede generar desde el flujo de consulta, se intenta último fallback.
  }

  const mainContent =
    typeof conservationDispatchRepo.getDocumentMainContent === "function"
      ? await conservationDispatchRepo.getDocumentMainContent(documentId)
      : null;

  const contentBuffer = toBuffer(mainContent?.content);

  if (contentBuffer?.length) {
    return {
      filename: `${safeFileName(
        doc.officialCode || `documento-${doc.id}`,
        `documento-${doc.id}`,
      )}.pdf`,
      buffer: contentBuffer,
      mimeType: normalizeMimeType(doc.mimeType),
    };
  }

  throw buildError(
    "No se encontró el archivo PDF principal del documento para adjuntarlo.",
    "DOCUMENT_FILE_NOT_AVAILABLE",
    409,
  );
}

export const conservationDispatchService = {
  async getDispatchDetail(documentId, actor) {
    const actorId = Number(
      actor?.id || actor?.userId || actor?.usuario_id || 0,
    );

    if (!actorId) {
      throw buildError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const doc =
      await conservationDispatchRepo.findConservationDocumentById(documentId);

    if (!doc) {
      throw buildError("Document not found in conservation", "NOT_FOUND", 404);
    }

    if (!(await canActorDispatchDocument(actor, doc))) {
      throw buildError(
        "You do not have permission to dispatch this document",
        "FORBIDDEN",
        403,
      );
    }

    if (String(doc.state || "").toUpperCase() !== "ARCHIVADO") {
      throw buildError(
        "Only archived conservation documents can be dispatched",
        "INVALID_DOCUMENT_STATE",
        409,
      );
    }

    const mainFileName = `${safeFileName(
      doc.officialCode || `documento-${doc.id}`,
      `documento-${doc.id}`,
    )}.pdf`;

    const anexos =
      typeof conservationDispatchRepo.listDispatchAnexos === "function"
        ? await conservationDispatchRepo.listDispatchAnexos(documentId)
        : [];

    const mainSize =
      doc.sizeBytes != null && doc.sizeBytes !== ""
        ? Number(doc.sizeBytes)
        : null;

    const attachments = [
      {
        id: MAIN_DOCUMENT_ATTACHMENT_ID,
        fileName: mainFileName,
        mimeType: "application/pdf",
        sizeBytes: mainSize,
        required: true,
        selectedByDefault: true,
        isMainDocument: true,
      },
      ...anexos.map((anexo) => ({
        id: Number(anexo.id),
        fileName: anexo.fileName,
        mimeType: anexo.mimeType || "application/octet-stream",
        sizeBytes: anexo.sizeBytes ?? null,
        required: false,
        selectedByDefault: false,
        isMainDocument: false,
      })),
    ];

    return {
      document: {
        id: Number(doc.id),
        officialCode: doc.officialCode || "",
        title: doc.title || "",
        state: doc.state || "ARCHIVADO",
        documentType: doc.documentType || null,
        producingUnit: doc.producingUnit || null,
        dispatchEmails: normalizeEmailsArray(doc.dispatchEmails || []),
      },
      attachments,
    };
  },

  async sendDispatchEmail(documentId, rawPayload, actor) {
    const actorId = Number(
      actor?.id || actor?.userId || actor?.usuario_id || 0,
    );

    if (!actorId) {
      throw buildError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const payload = dispatchEmailSchema.parse(rawPayload);

    const doc =
      await conservationDispatchRepo.findConservationDocumentById(documentId);

    if (!doc) {
      throw buildError("Document not found in conservation", "NOT_FOUND", 404);
    }

    if (!(await canActorDispatchDocument(actor, doc))) {
      throw buildError(
        "You do not have permission to dispatch this document",
        "FORBIDDEN",
        403,
      );
    }

    if (String(doc.state || "").toUpperCase() !== "ARCHIVADO") {
      throw buildError(
        "Only archived conservation documents can be dispatched",
        "INVALID_DOCUMENT_STATE",
        409,
      );
    }

    if (!payload.attachmentIds.includes(MAIN_DOCUMENT_ATTACHMENT_ID)) {
      throw buildError(
        "The main document must be included in the dispatch email",
        "MISSING_MAIN_ATTACHMENT",
        422,
      );
    }

    const mainPdf = await resolveMainPdfForEmail({
      documentId,
      doc,
    });

    const attachments = [
      {
        filename: mainPdf.filename,
        content: mainPdf.buffer,
        contentType: mainPdf.mimeType || "application/pdf",
      },
    ];

    const attachmentSummary = [
      {
        id: MAIN_DOCUMENT_ATTACHMENT_ID,
        fileName: mainPdf.filename,
        mimeType: mainPdf.mimeType || "application/pdf",
        isMainDocument: true,
      },
    ];

    const optionalAttachmentIds = payload.attachmentIds.filter(
      (id) => Number(id) !== MAIN_DOCUMENT_ATTACHMENT_ID,
    );

    for (const attachmentId of optionalAttachmentIds) {
      if (
        typeof conservationDispatchRepo.findDispatchAnexoById !== "function"
      ) {
        continue;
      }

      const anexo = await conservationDispatchRepo.findDispatchAnexoById({
        documentId,
        anexoId: attachmentId,
      });

      if (!anexo) {
        continue;
      }

      const anexoBuffer = readFileIfExists(anexo.filePath);

      if (!anexoBuffer?.length) {
        continue;
      }

      attachments.push({
        filename: anexo.fileName,
        content: anexoBuffer,
        contentType: anexo.mimeType || "application/octet-stream",
      });

      attachmentSummary.push({
        id: Number(anexo.id),
        fileName: anexo.fileName,
        mimeType: anexo.mimeType || "application/octet-stream",
        isMainDocument: false,
      });
    }

    const actorContact = await resolveActorContact(actorId);
    const actorName = actorContact.name;
    const mailFrom = process.env.MAIL_FROM || process.env.MAIL_USER;

    const transporter = createTransporter();

    try {
      const result = await transporter.sendMail({
        from: `"Patrimonius - ${actorContact.name}" <${mailFrom}>`,
        replyTo: actorContact.email || mailFrom,
        to: payload.to,
        cc: payload.cc || [],
        subject: payload.subject,
        text: `${payload.message}

---
Enviado por: ${actorContact.name}
Correo del remitente: ${actorContact.email || "No registrado"}
Sistema: Patrimonius
Documento: ${doc.title || "—"}
Código: ${doc.officialCode || "—"}`,
        html: buildHtmlMessage({
          message: payload.message,
          document: doc,
          sender: actorContact,
        }),
        attachments,
      });

      const history = await conservationDispatchRepo.insertDispatchHistory({
        documentId,
        sentBy: actorId,
        to: payload.to,
        cc: payload.cc || [],
        subject: payload.subject,
        message: payload.message,
        attachments: attachmentSummary,
        messageId: result?.messageId || null,
        estado: "ENVIADO",
      });

      await logCycleEvent({
        actorId,
        documentId,
        accion: "CONSERVACION_DESPACHO_CORREO",
        resultado: "PERMITIDO",
        detail: {
          accion_solicitada: "DESPACHAR_DOCUMENTO_CORREO",
          motivo: "Documento despachado por correo electrónico",
          despachoId: history.id,
          officialCode: doc.officialCode,
          to: payload.to,
          cc: payload.cc || [],
          attachments: attachmentSummary.map((item) => item.fileName),
          responsable: actorName,
          sender: {
            name: actorContact.name,
            email: actorContact.email,
          },
        },
      });

      const expId = Number(
        doc?.payloadSnapshot?.classification?.expedienteId || 0,
      );

      if (expId > 0) {
        await insertBitacoraExpedienteSafe({
          expediente_id: expId,
          usuario_id: resolveBitacoraUsuarioId(actorId),
          evento: "DESCARGA",
          resultado: "PERMITIDO",
          detalle: {
            documento_id: Number(documentId),
            despachoId: history.id,
            officialCode: doc.officialCode,
            to: payload.to,
            cc: payload.cc || [],
            adjuntos: attachmentSummary,
            sender: {
              name: actorContact.name,
              email: actorContact.email,
            },
          },
        });
      }

      return {
        ok: true,
        message: "Documento enviado por correo correctamente.",
        dispatchId: history.id,
        documentId: Number(documentId),
      };
    } catch (error) {
      await conservationDispatchRepo.insertDispatchHistory({
        documentId,
        sentBy: actorId,
        to: payload.to,
        cc: payload.cc || [],
        subject: payload.subject,
        message: payload.message,
        attachments: attachmentSummary,
        messageId: null,
        estado: "FALLIDO",
        error: error?.message || "No se pudo enviar el correo",
      });

      await logCycleEvent({
        actorId,
        documentId,
        accion: "CONSERVACION_DESPACHO_CORREO",
        resultado: "DENEGADO",
        detail: {
          accion_solicitada: "DESPACHAR_DOCUMENTO_CORREO",
          motivo: "Fallo al enviar correo electrónico",
          officialCode: doc.officialCode,
          to: payload.to,
          cc: payload.cc || [],
          attachments: attachmentSummary.map((item) => item.fileName),
          sender: {
            name: actorContact.name,
            email: actorContact.email,
          },
          error: error?.message || "Unknown mail error",
        },
      });

      throw buildError(
        error?.message || "Could not send dispatch email",
        "MAIL_SEND_FAILED",
        502,
      );
    }
  },

  async listDispatchHistory(documentId, actor) {
    const actorId = Number(
      actor?.id || actor?.userId || actor?.usuario_id || 0,
    );

    if (!actorId) {
      throw buildError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const doc =
      await conservationDispatchRepo.findConservationDocumentById(documentId);

    if (!doc) {
      throw buildError("Document not found in conservation", "NOT_FOUND", 404);
    }

    if (!(await canActorDispatchDocument(actor, doc))) {
      throw buildError(
        "You do not have permission to view dispatch history",
        "FORBIDDEN",
        403,
      );
    }

    return conservationDispatchRepo.listDispatchHistory(documentId);
  },
};

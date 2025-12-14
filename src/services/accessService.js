//src/services/accessService.js
import { accessRepo } from "../repositories/accessRepo.js";
import {
  logAdminAction,
  logSecurityEvent,
} from "../repositories/bitacoraRepo.js";

/** Business logic for HU-002. */
const SENSITIVE_LEVELS = new Set(["INTERNAL", "HIGH", "RESTRICTED"]);
const VALID_ACTIONS = new Set(["VIEW", "EDIT", "SIGN"]);

function normActions(arr) {
  return Array.from(
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map((a) => String(a).toUpperCase())
        .filter((a) => VALID_ACTIONS.has(a))
    )
  );
}

export const accessService = {
  /** Returns current config for a document or null if not found. */
  async getDocumentConfig(documentId) {
    return accessRepo.getConfig(documentId);
  },

  /** Replace configuration atomically: level + allowed users + allowed roles. */
  async setDocumentConfig(
    documentId,
    { level, users = [], roles = [] },
    actor
  ) {
    if (!["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"].includes(level)) {
      const err = new Error("invalid level");
      err.code = 400;
      throw err;
    }

    // Normalize action sets
    const usersN = users.map((u) => ({
      userId: Number(u.userId),
      actions: normActions(u.actions).length
        ? normActions(u.actions)
        : ["VIEW", "EDIT", "SIGN"],
    }));
    const rolesN = roles.map((r) => ({
      roleId: Number(r.roleId),
      actions: normActions(r.actions).length
        ? normActions(r.actions)
        : ["VIEW", "EDIT", "SIGN"],
    }));

    await accessRepo.setLevel(documentId, level);
    await accessRepo.upsertUsers(documentId, usersN);
    await accessRepo.upsertRoles(documentId, rolesN);

    await logAdminAction({
      actorId: actor?.id ?? null,
      docId: documentId,
      action: "CONF_ACCESS_UPDATE",
      result: "OK",
      detail: { level, users: usersN, roles: rolesN },
    });

    return accessRepo.getConfig(documentId);
  },

  /**
   * Check access for a user and action.
   * Rule: if document level is sensitive (not PUBLIC), explicit allow by user or role is required.
   * This HU has priority over any future unit-based access.
   * On denial, a security event is logged.
   */
  async checkAccess({ documentId, action, user }, clientIp, userAgent) {
    const act = String(action || "VIEW").toUpperCase();
    if (!VALID_ACTIONS.has(act)) {
      const err = new Error("invalid action");
      err.code = 400;
      throw err;
    }

    const level = await accessRepo.getLevel(documentId);
    if (level == null) {
      const err = new Error("document not found");
      err.code = 404;
      throw err;
    }

    // If not sensitive, allow by default.
    if (!SENSITIVE_LEVELS.has(level)) {
      return { allowed: true, level, reason: "PUBLIC" };
    }

    const allowed = await accessRepo.isUserExplicitlyAllowed({
      documentId,
      userId: user?.id ?? 0,
      roleId: user?.rolId ?? 0,
      action: act,
    });

    if (!allowed) {
      await logSecurityEvent({
        actorId: user?.id ?? null,
        tipo: "ACCESO_NO_AUTORIZADO",
        result: "DENIED",
        ip: clientIp ?? null,
        userAgent: userAgent ?? null,
        detail: {
          documentId,
          action: act,
          level,
          reason: "Explicit authorization required",
        },
      });
      return { allowed: false, level, reason: "EXPLICIT_REQUIRED" };
    }

    return { allowed: true, level, reason: "EXPLICIT_ALLOW" };
  },
};

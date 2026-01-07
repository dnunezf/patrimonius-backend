// src/services/accessService.js
import { accessRepo } from "../repositories/accessRepo.js";
import {
  logAdminAction,
  logSecurityEvent,
} from "../repositories/bitacoraRepo.js";

const SENSITIVE_LEVELS = new Set(["INTERNAL", "HIGH", "RESTRICTED"]);
const VALID_ACTIONS = new Set(["VIEW", "EDIT", "SIGN"]);
const VALID_LEVELS = new Set(["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"]);

function normActions(arr) {
  const list = Array.isArray(arr) ? arr : [];
  const uniq = Array.from(
    new Set(
      list
        .map((a) => String(a).toUpperCase().trim())
        .filter((a) => VALID_ACTIONS.has(a))
    )
  );
  return uniq;
}

function ensurePosInt(name, v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error(`invalid_${name}`);
    e.code = 400;
    throw e;
  }
  return n;
}

export const accessService = {
  async getDocumentConfig(documentId) {
    const id = ensurePosInt("documentId", documentId);
    return accessRepo.getConfig(id);
  },

  async setDocumentConfig(
    documentId,
    { level, users = [], roles = [] },
    actor
  ) {
    const id = ensurePosInt("documentId", documentId);

    const lv = String(level || "").toUpperCase();
    if (!VALID_LEVELS.has(lv)) {
      const err = new Error("invalid_level");
      err.code = 400;
      throw err;
    }

    // ensure document exists (avoid silent update)
    const exists = await accessRepo.documentExists(id);
    if (!exists) {
      const err = new Error("document_not_found");
      err.code = 404;
      throw err;
    }

    // normalize + de-duplicate entries
    const usersN = Array.from(
      new Map(
        (Array.isArray(users) ? users : []).map((u) => {
          const userId = ensurePosInt("userId", u?.userId);
          const acts = normActions(u?.actions);
          return [
            userId,
            {
              userId,
              actions: acts.length ? acts : ["VIEW", "EDIT", "SIGN"],
            },
          ];
        })
      ).values()
    );

    const rolesN = Array.from(
      new Map(
        (Array.isArray(roles) ? roles : []).map((r) => {
          const roleId = ensurePosInt("roleId", r?.roleId);
          const acts = normActions(r?.actions);
          return [
            roleId,
            {
              roleId,
              actions: acts.length ? acts : ["VIEW", "EDIT", "SIGN"],
            },
          ];
        })
      ).values()
    );

    // FK validation (explicit, stable errors)
    const usersOk = await accessRepo.usersExist(usersN.map((x) => x.userId));
    if (!usersOk) {
      const err = new Error("one_or_more_users_not_found");
      err.code = 400;
      throw err;
    }

    const rolesOk = await accessRepo.rolesExist(rolesN.map((x) => x.roleId));
    if (!rolesOk) {
      const err = new Error("one_or_more_roles_not_found");
      err.code = 400;
      throw err;
    }

    await accessRepo.setLevel(id, lv);
    await accessRepo.upsertUsers(id, usersN);
    await accessRepo.upsertRoles(id, rolesN);

    await logAdminAction({
      actorId: actor?.id ?? null,
      docId: id,
      action: "CONF_ACCESS_UPDATE",
      result: "OK",
      detail: { level: lv, users: usersN, roles: rolesN },
    });

    return accessRepo.getConfig(id);
  },

  async checkAccess({ documentId, action, user }, clientIp, userAgent) {
    const id = ensurePosInt("documentId", documentId);

    const act = String(action || "VIEW").toUpperCase();
    if (!VALID_ACTIONS.has(act)) {
      const err = new Error("invalid_action");
      err.code = 400;
      throw err;
    }

    const level = await accessRepo.getLevel(id);
    if (level == null) {
      const err = new Error("document_not_found");
      err.code = 404;
      throw err;
    }

    // PUBLIC => allow
    if (!SENSITIVE_LEVELS.has(level)) {
      return { allowed: true, level, reason: "PUBLIC" };
    }

    const userId = Number(user?.id ?? 0);
    const primaryRoleId = Number(user?.rolId ?? 0);

    // multi-roles from JWT (plus primary rolId)
    const roleIds = Array.from(
      new Set(
        []
          .concat(Array.isArray(user?.rolIds) ? user.rolIds : [])
          .concat(primaryRoleId ? [primaryRoleId] : [])
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    );

    const allowed = await accessRepo.isUserExplicitlyAllowed({
      documentId: id,
      userId,
      roleIds,
      action: act,
    });

    if (!allowed) {
      await logSecurityEvent({
        actorId: userId || null,
        tipo: "ACCESO_NO_AUTORIZADO",
        result: "DENIED",
        ip: clientIp ?? null,
        userAgent: userAgent ?? null,
        detail: {
          documentId: id,
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

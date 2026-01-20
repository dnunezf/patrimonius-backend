// src/services/confidentiality.service.js

const LEVELS = new Set(["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"]);
const ACTIONS = new Set(["VIEW", "EDIT", "SIGN"]);

function normalizeActions(actions) {
  const arr = Array.isArray(actions)
    ? actions
    : typeof actions === "string"
      ? actions.split(",").map((s) => s.trim())
      : [];

  const out = Array.from(new Set(arr.filter((a) => ACTIONS.has(a))));
  return out;
}

export class ConfidentialityService {
  /**
   * @param {{ repo: any, securityRepo: any }} deps
   */
  constructor({ repo, securityRepo }) {
    this.repo = repo;
    this.securityRepo = securityRepo;
  }

  async listDocuments(search) {
    return this.repo.listDocuments(search);
  }

  async getConfig(documentId) {
    return this.repo.getConfig(documentId);
  }

  /**
   * HU-002 config save:
   * - Non-PUBLIC requires at least one user or role.
   * - No duplicates, ids must be positive ints.
   */
  async setConfig(documentId, dto) {
    const level = String(dto?.level || "").toUpperCase();
    if (!LEVELS.has(level)) {
      const err = new Error("invalid_level");
      err.status = 400;
      throw err;
    }

    const users = Array.isArray(dto?.users) ? dto.users : [];
    const roles = Array.isArray(dto?.roles) ? dto.roles : [];

    if (level !== "PUBLIC" && users.length === 0 && roles.length === 0) {
      const err = new Error("sensitive_requires_allow_list");
      err.status = 400;
      throw err;
    }

    const userIds = new Set();
    for (const u of users) {
      const id = Number(u?.userId);
      if (!Number.isFinite(id) || id <= 0) {
        const err = new Error("invalid_user_id");
        err.status = 400;
        throw err;
      }
      if (userIds.has(id)) {
        const err = new Error("duplicate_user");
        err.status = 400;
        throw err;
      }
      userIds.add(id);

      const a = normalizeActions(u?.actions);
      if (!a.length) {
        const err = new Error("user_requires_actions");
        err.status = 400;
        throw err;
      }
      u.userId = id;
      u.actions = a;
    }

    const roleIds = new Set();
    for (const r of roles) {
      const id = Number(r?.roleId);
      if (!Number.isFinite(id) || id <= 0) {
        const err = new Error("invalid_role_id");
        err.status = 400;
        throw err;
      }
      if (roleIds.has(id)) {
        const err = new Error("duplicate_role");
        err.status = 400;
        throw err;
      }
      roleIds.add(id);

      const a = normalizeActions(r?.actions);
      if (!a.length) {
        const err = new Error("role_requires_actions");
        err.status = 400;
        throw err;
      }
      r.roleId = id;
      r.actions = a;
    }

    return this.repo.setConfig(documentId, { level, users, roles });
  }

  /**
   * HU-002 access decision:
   * Inputs: authorized users/roles per document, level, requested action.
   * Output: allowed/denied. Denied -> logged.
   */
  async checkAccess({ actorId, actorRolIds, documentId, action }) {
    const act = String(action || "").toUpperCase();
    if (!ACTIONS.has(act)) {
      const err = new Error("invalid_action");
      err.status = 400;
      throw err;
    }

    const cfg = await this.repo.getConfig(documentId);
    const level = cfg.level;

    if (level === "PUBLIC") {
      return { allowed: true, level, reason: "public" };
    }

    const userAllowed = actorId
      ? await this.repo.isUserAllowed(documentId, actorId, act)
      : false;

    const roleAllowed = await this.repo.isAnyRoleAllowed(
      documentId,
      actorRolIds || [],
      act,
    );

    const allowed = userAllowed || roleAllowed;

    if (!allowed) {
      await this.securityRepo.logDenied({
        actorId: actorId ?? null,
        documentId: Number(documentId),
        action: act,
        reason: "explicit_authorization_required",
        level,
      });
      return {
        allowed: false,
        level,
        reason: "explicit_authorization_required",
      };
    }

    return {
      allowed: true,
      level,
      reason: userAllowed ? "user_allow_list" : "role_allow_list",
    };
  }
}

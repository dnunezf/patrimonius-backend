// src/services/confidentiality.service.js

/**
 * ConfidentialityService
 * - Validates config rules (sensitive levels require allow-list).
 * - Calls repo and writes audit/security logs.
 */

const LEVELS = new Set(["PUBLIC", "INTERNAL", "HIGH", "RESTRICTED"]);
const ACTIONS = new Set(["VIEW", "EDIT", "SIGN"]);

function normalizeActions(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.filter((x) => ACTIONS.has(x)))];
  }
  if (typeof input === "string") {
    return [
      ...new Set(
        input
          .split(",")
          .map((s) => s.trim())
          .filter((x) => ACTIONS.has(x))
      ),
    ];
  }
  return [];
}

function normalizeLevel(level) {
  return LEVELS.has(level) ? level : "PUBLIC";
}

export class ConfidentialityService {
  constructor({ repo, bitacoraRepo }) {
    this.repo = repo;
    this.bitacoraRepo = bitacoraRepo;
  }

  async listDocuments(search) {
    return this.repo.listDocuments(search);
  }

  async getConfig(documentId) {
    const cfg = await this.repo.getConfig(documentId);
    if (!cfg) {
      const err = new Error("Document not found");
      err.status = 404;
      err.code = "document_not_found";
      throw err;
    }
    return cfg;
  }

  async setConfig({ actorId, documentId, dto }) {
    const level = normalizeLevel(dto?.level);
    const users = (dto?.users || []).map((u) => ({
      userId: Number(u.userId),
      actions: normalizeActions(u.actions),
    }));
    const roles = (dto?.roles || []).map((r) => ({
      roleId: Number(r.roleId),
      actions: normalizeActions(r.actions),
    }));

    const sensitive = level !== "PUBLIC";
    if (sensitive && users.length === 0 && roles.length === 0) {
      const err = new Error(
        "Sensitive levels require at least one authorized user or role."
      );
      err.status = 400;
      err.code = "validation_error";
      throw err;
    }

    await this.repo.setConfig({ documentId, level, users, roles });

    // Audit (admin action)
    await this.bitacoraRepo.logAdminAction({
      actorId,
      docId: Number(documentId),
      action: "CONFIDENTIALITY_SET",
      result: "OK",
      detail: {
        level,
        usersCount: users.length,
        rolesCount: roles.length,
      },
    });

    // Return fresh server state (ensures UI matches DB)
    return this.repo.getConfig(documentId);
  }
}

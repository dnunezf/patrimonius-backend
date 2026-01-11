// src/services/confidentiality.service.js
import { normalizeActions } from "../validators/confidentiality.schema.js";

/**
 * ConfidentialityService (HU-002)
 * - PUBLIC: confidentiality layer allows by default.
 * - INTERNAL/HIGH/RESTRICTED: requires explicit allow-list (user or role).
 * - Denied attempts must be logged to Bitacora_Seguridad with tipo_evento = 'ACCESO_NO_AUTORIZADO'.
 */
export class ConfidentialityService {
  constructor({ pool, repo, bitacoraRepo }) {
    this.pool = pool;
    this.repo = repo;
    this.bitacoraRepo = bitacoraRepo;
  }

  async listDocuments(search) {
    return this.repo.listDocuments(search || "");
  }

  async getConfig(documentId) {
    return this.repo.getConfig(documentId);
  }

  async setConfig(actor, documentId, dto) {
    const conn = await this.pool.getConnection();

    // Normalize inputs defensively (service-level)
    const users = (dto.users || []).map((u) => ({
      userId: Number(u.userId),
      actions: normalizeActions(u.actions),
    }));

    const roles = (dto.roles || []).map((r) => ({
      roleId: Number(r.roleId),
      actions: normalizeActions(r.actions),
    }));

    try {
      await conn.beginTransaction();

      await this.repo.setConfigTx(conn, documentId, dto.level, users, roles);

      await conn.commit();

      // Admin audit (Bitacora_Base + Bitacora_Actividad_Usuario)
      // NOTE: We do not write Bitacora_Permisos here; that repo is for HU-005 exceptions.
      await this.bitacoraRepo?.logAdminAction?.({
        actorId: actor?.id ?? null,
        docId: documentId,
        action: "CONFIDENTIALITY_UPDATE",
        result: "OK",
        detail: {
          documentId,
          level: dto.level,
          users,
          roles,
        },
      });

      return this.repo.getConfig(documentId);
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Access check used by POST /access/check.
   * HU-002 priority rule:
   * - If level is not PUBLIC, allow ONLY if explicitly authorized by user or role allow-list.
   * - Unit access is not evaluated here; confidentiality overrides it.
   */
  async checkAccess({ actor, documentId, action, roleIds, ip, userAgent }) {
    const level = await this.repo.getDocLevel(documentId);

    if (!level) {
      return { allowed: false, level: null, reason: "DOCUMENT_NOT_FOUND" };
    }

    // PUBLIC: confidentiality does not restrict.
    if (level === "PUBLIC") {
      return { allowed: true, level, reason: "PUBLIC" };
    }

    const actorId = actor?.id ?? null;
    if (!actorId) {
      // No actor: deny and log as security event (optional; depends on your policy)
      await this.bitacoraRepo?.logSecurityEvent?.({
        actorId: 0,
        tipo: "ACCESO_NO_AUTORIZADO",
        result: "DENIED",
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        detail: { documentId, action, level, reason: "NOT_AUTHENTICATED" },
      });
      return { allowed: false, level, reason: "NOT_AUTHENTICATED" };
    }

    const userAllowed = await this.repo.isUserAllowed(
      documentId,
      actorId,
      action
    );
    if (userAllowed)
      return { allowed: true, level, reason: "EXPLICIT_USER_ALLOW" };

    const roleAllowed = await this.repo.isAnyRoleAllowed(
      documentId,
      roleIds || [],
      action
    );
    if (roleAllowed)
      return { allowed: true, level, reason: "EXPLICIT_ROLE_ALLOW" };

    // Deny + log (HU-002 requirement)
    await this.bitacoraRepo?.logSecurityEvent?.({
      actorId,
      tipo: "ACCESO_NO_AUTORIZADO",
      result: "DENIED",
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      detail: {
        documentId,
        action,
        level,
        reason: "NOT_EXPLICITLY_AUTHORIZED",
      },
    });

    return { allowed: false, level, reason: "NOT_EXPLICITLY_AUTHORIZED" };
  }
}

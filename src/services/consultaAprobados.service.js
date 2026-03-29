// src/services/consultaAprobados.service.js
import { consultaAprobadosRepo } from "../repositories/consultaAprobados.repo.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";

/** Rol USUARIO_EXTERNO en seed (bd_patrimonius). */
const ROL_ID_EXTERNO = Number(process.env.ROL_ID_EXTERNO) || 5;
/** Rol ADMINISTRADOR en seed. */
const ROL_ID_ADMIN = Number(process.env.ROL_ID_ADMIN) || 1;

/**
 * Usuario “solo externo” para HU-025: si tiene cualquier rol interno (≠ externo), aplica consulta interna.
 * Así un usuario multi-rol (p. ej. ADMIN + USUARIO + EXTERNO) no queda forzado a la lista solo-APROBADO.
 */
function isExternalUser(user) {
    const rolIds = Array.isArray(user?.rolIds)
        ? [...new Set(user.rolIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
        : [];

    if (rolIds.some((id) => id !== ROL_ID_EXTERNO)) return false;

    const primary = Number(user?.rolId ?? 0);
    if (primary > 0 && primary !== ROL_ID_EXTERNO) return false;

    const r = String(user?.role || "")
        .toUpperCase()
        .replace(/\s+/g, "_");
    if (r === "USUARIO_EXTERNO" || r === "USUARIOEXTERNO") return true;

    const roles = user?.roles;
    if (Array.isArray(roles)) {
        for (const x of roles) {
            const s = String(x || "")
                .toUpperCase()
                .replace(/\s+/g, "_");
            if (s.includes("EXTERNO")) return true;
        }
    }

    if (primary === ROL_ID_EXTERNO) return true;
    if (rolIds.length === 1 && rolIds[0] === ROL_ID_EXTERNO) return true;
    return false;
}

/** Incluye USUARIO_EXTERNO aunque haya otros roles (multi-rol). */
function hasExternoRole(user) {
    const rolIds = Array.isArray(user?.rolIds)
        ? user.rolIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : [];
    if (rolIds.includes(ROL_ID_EXTERNO)) return true;

    const r = String(user?.role || "")
        .toUpperCase()
        .replace(/\s+/g, "_");
    if (r === "USUARIO_EXTERNO" || r === "USUARIOEXTERNO") return true;

    const roles = user?.roles;
    if (Array.isArray(roles)) {
        for (const x of roles) {
            const s = String(x || "")
                .toUpperCase()
                .replace(/\s+/g, "_");
            if (s.includes("EXTERNO")) return true;
        }
    }

    const primary = Number(user?.rolId ?? 0);
    return primary === ROL_ID_EXTERNO;
}

/** Petición explícita desde el panel de consulta externa (HU-024: permisos por fila). */
function wantsPanelExternoCatalog(query) {
    const v = query?.panelExterno ?? query?.externoCatalogo;
    const s = String(v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}

function isMasterUser(user) {
    if (user?.isMaster === true) return true;
    const r = String(user?.role || "")
        .toUpperCase()
        .replace(/\s+/g, "_");
    if (r === "ADMINISTRADOR" || r === "ADMIN") return true;
    const rolIds = Array.isArray(user?.rolIds) ? user.rolIds.map(Number) : [];
    if (rolIds.includes(ROL_ID_ADMIN)) return true;
    return false;
}

/** Valores válidos en Bitacora_Actividad_Usuario.actividad (ENUM). */
function actividadBitacoraEnum(accionHu025) {
    if (accionHu025 === "VISTA_PREVIA") return "VISTA";
    if (accionHu025 === "DESCARGA") return "DESCARGA";
    if (accionHu025 === "BUSQUEDA") return "BUSQUEDA";
    return "OTRA";
}

async function logHu025({ usuario_id, documento_id, accion, req, extra }) {
    const baseId = await bitacoraRepo.insertBase({
        fecha: new Date(),
        accion: `HU025_${accion}`,
        resultado: "PERMITIDO",
        usuario_id,
        documento_id: documento_id ?? null,
    });
    await bitacoraRepo.insertActividad({
        id: baseId,
        actividad: actividadBitacoraEnum(accion),
        recurso: "DOCUMENTO_APROBADO",
        parametros: JSON.stringify({
            ...(extra || {}),
            path: req?.originalUrl,
            ip: req?.ip,
        }),
    });
}

export const consultaAprobadosService = {
    async search({ user, actor, query, req }) {
        /** Catálogo externo (todas las unidades + canDownload por Permiso_Usuario VIEW). */
        const useExternoCatalog =
            isExternalUser(user) ||
            (hasExternoRole(user) && wantsPanelExternoCatalog(query));
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 10;
        const sortBy = query.sortBy ?? "fecha_aprobacion";
        const sortDir = query.sortDir ?? "desc";

        if (!useExternoCatalog && !isMasterUser(user)) {
            const uid = actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;
            if (uid == null || Number.isNaN(Number(uid))) {
                const e = new Error("No se pudo determinar la unidad organizacional del usuario");
                e.code = "BAD_REQUEST";
                throw e;
            }
        }

        const filters = {
            q: query.q,
            categoriaId: query.categoriaId,
            unidadId: query.unidadId,
            serieId: query.serieId,
            subserieId: query.subserieId,
            expedienteId: query.expedienteId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
        };

        let result;
        if (useExternoCatalog) {
            result = await consultaAprobadosRepo.searchExterno({
                userId: actor.id,
                rolIds: actor.rolIds || [],
                filters,
                page,
                pageSize,
                sortBy,
                sortDir,
            });
        } else {
            result = await consultaAprobadosRepo.searchInternal({
                userId: actor.id,
                unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
                isMaster: isMasterUser(user),
                rolIds: actor.rolIds || [],
                filters,
                page,
                pageSize,
                sortBy,
                sortDir,
            });
        }

        try {
            await logHu025({
                usuario_id: actor.id,
                documento_id: null,
                accion: "BUSQUEDA",
                req,
                extra: {
                    filters,
                    totalItems: result.totalItems,
                    useExternoCatalog,
                },
            });
        } catch (err) {
            console.warn("HU025 bitácora búsqueda:", err?.message);
        }

        const items = (result.items || []).map((row) => {
            const estadoEtiqueta =
                row.estado === "ARCHIVADO"
                    ? "Archivado"
                    : row.estado === "APROBADO"
                      ? "Aprobado"
                      : String(row.estado || "");
            const base = { ...row, estadoEtiqueta };
            if (useExternoCatalog) {
                const ok = Boolean(row.can_view_perm);
                const { can_view_perm: _cv, ...rest } = base;
                return {
                    ...rest,
                    canView: ok,
                    canPreview: ok,
                    canDownload: ok,
                };
            }
            return {
                ...base,
                canPreview: true,
                canDownload: true,
            };
        });

        const master = isMasterUser(user);
        const uidInterno =
            actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;

        return {
            ...result,
            items,
            viewer: useExternoCatalog ? "externo" : "interno",
            totalDescargables: useExternoCatalog ? result.totalDescargables : undefined,
            /** Solo interno no master: la consulta restringe por esta unidad (debe coincidir con Documento.unidad_id). */
            filtroUnidadUsuario:
                useExternoCatalog || master ? null : Number(uidInterno),
            aplicaFiltroUnidad: !useExternoCatalog && !master,
        };
    },

    async listFilters({ user, actor, query = {} }) {
        const useExternoCatalog =
            isExternalUser(user) ||
            (hasExternoRole(user) && wantsPanelExternoCatalog(query));
        if (useExternoCatalog) {
            return consultaAprobadosRepo.listFiltersExterno();
        }
        if (!isMasterUser(user)) {
            const uid = actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;
            if (uid == null || Number.isNaN(Number(uid))) {
                const e = new Error("No se pudo determinar la unidad organizacional del usuario");
                e.code = "BAD_REQUEST";
                throw e;
            }
        }
        return consultaAprobadosRepo.listFiltersInternal({
            userId: actor.id,
            unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
            isMaster: isMasterUser(user),
        });
    },

    async assertCanAccess({ user, actor, documentoId, req, accion }) {
        const external = isExternalUser(user);
        const id = Number(documentoId);
        let ok;
        if (external) {
            ok = await consultaAprobadosRepo.existsForExterno({
                documentoId: id,
                userId: actor.id,
            });
        } else {
            ok = await consultaAprobadosRepo.existsForInternal({
                documentoId: id,
                userId: actor.id,
                unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
                isMaster: isMasterUser(user),
            });
        }
        if (!ok) {
            const e = new Error("Acceso no autorizado al documento");
            e.code = "FORBIDDEN";
            throw e;
        }
        try {
            await logHu025({
                usuario_id: actor.id,
                documento_id: id,
                accion,
                req,
                extra: { external },
            });
        } catch (err) {
            console.warn("HU025 bitácora acción:", err?.message);
        }
    },
};

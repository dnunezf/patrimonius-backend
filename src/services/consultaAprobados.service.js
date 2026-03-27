// src/services/consultaAprobados.service.js
import { consultaAprobadosRepo } from "../repositories/consultaAprobados.repo.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";

function isExternalUser(user) {
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

    if (Number(user?.rolId) === 5) return true;
    if (Array.isArray(user?.rolIds) && user.rolIds.map(Number).includes(5)) return true;

    return false;
}

function isMasterUser(user) {
    if (user?.isMaster === true) return true;
    const r = String(user?.role || "")
        .toUpperCase()
        .replace(/\s+/g, "_");
    return r === "ADMINISTRADOR" || r === "ADMIN";
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
        actividad: "CONSULTA",
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
        const external = isExternalUser(user);
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 10;
        const sortBy = query.sortBy ?? "fecha_aprobacion";
        const sortDir = query.sortDir ?? "desc";

        if (!external && !isMasterUser(user)) {
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
        if (external) {
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
                extra: { filters, totalItems: result.totalItems, external },
            });
        } catch (err) {
            console.warn("HU025 bitácora búsqueda:", err?.message);
        }

        const items = (result.items || []).map((row) => ({
            ...row,
            canPreview: true,
            canDownload: true,
            estadoEtiqueta:
                row.estado === "ARCHIVADO"
                    ? "Archivado"
                    : row.estado === "APROBADO"
                      ? "Aprobado"
                      : String(row.estado || ""),
        }));

        return {
            ...result,
            items,
            viewer: external ? "externo" : "interno",
        };
    },

    async listFilters({ user, actor }) {
        const external = isExternalUser(user);
        if (external) {
            return consultaAprobadosRepo.listFiltersExterno({ userId: actor.id });
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

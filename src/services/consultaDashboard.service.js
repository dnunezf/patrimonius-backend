// src/services/consultaDashboard.service.js
import { consultaDashboardRepo } from "../repositories/consultaDashboard.repo.js";
import { consultaAprobadosRepo } from "../repositories/consultaAprobados.repo.js";

const ROL_ID_ADMIN = Number(process.env.ROL_ID_ADMIN) || 1;

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

/** Lunes a domingo (fecha local del servidor) — novedades de la semana calendario. */
function rangoSemanaCalendarioLocal() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { desde: fmt(monday), hasta: fmt(sunday) };
}

function parseIntDef(v, def) {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : def;
}

export const consultaDashboardService = {
    /**
     * @param {object} opts
     * @param {object} [opts.query] — recientesDesde; descargasPage, descargasPageSize, descargasDesde;
     *   novedadesPage, novedadesPageSize, novedadesDesde
     */
    async getResumen({ user, actor, query = {} }) {
        const master = isMasterUser(user);
        const uid = actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;

        if (!master && (uid == null || Number.isNaN(Number(uid)))) {
            const e = new Error("No se pudo determinar la unidad organizacional del usuario");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const semana = rangoSemanaCalendarioLocal();

        const descargasPage = Math.max(1, parseIntDef(query.descargasPage, 1));
        const descargasPageSize = Math.min(100, Math.max(1, parseIntDef(query.descargasPageSize, 15)));
        const novedadesPage = Math.max(1, parseIntDef(query.novedadesPage, 1));
        const novedadesPageSize = Math.min(100, Math.max(1, parseIntDef(query.novedadesPageSize, 20)));

        const recientesDesde = query.recientesDesde || null;
        const descargasDesde = query.descargasDesde || null;

        const [recientesResult, descargasResult, novedadesResult] = await Promise.all([
            consultaDashboardRepo.listUltimasDescargas({
                userId: actor.id,
                fechaDesde: recientesDesde,
                limit: 15,
            }),
            consultaDashboardRepo.listDescargasAgregadas({
                userId: actor.id,
                page: descargasPage,
                pageSize: descargasPageSize,
                fechaDesde: descargasDesde,
            }),
            consultaAprobadosRepo.listNovedadesSemanaActual({
                userId: actor.id,
                unidadId: Number(uid),
                isMaster: master,
                dateFrom: semana.desde,
                dateTo: semana.hasta,
                page: novedadesPage,
                pageSize: novedadesPageSize,
                fechaDesde: query.novedadesDesde || null,
            }),
        ]);

        return {
            semana,
            /** Alias útil para el cliente (mismo rango que la semana calendario). */
            periodo: semana,
            recientes: recientesResult.items,
            recientesTotal: recientesResult.totalItems,
            recientesTotalPages: recientesResult.totalPages,
            recientesPage: recientesResult.page,
            recientesPageSize: recientesResult.pageSize,
            descargasPorDocumento: descargasResult.items,
            descargasTotal: descargasResult.totalItems,
            descargasTotalPages: descargasResult.totalPages,
            descargasPage: descargasResult.page,
            descargasPageSize: descargasResult.pageSize,
            novedades: novedadesResult.items,
            novedadesTotal: novedadesResult.totalItems,
            novedadesTotalPages: novedadesResult.totalPages,
            novedadesPage: novedadesResult.page,
            novedadesPageSize: novedadesResult.pageSize,
        };
    },

    async getHistorial({ query, actor }) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const fechaDesde = query.desde ?? query.fechaDesde ?? null;
        return consultaDashboardRepo.listHistorial({
            userId: actor.id,
            page,
            pageSize,
            fechaDesde,
        });
    },

    async getDocumentosPorIds({ user, actor, body }) {
        const raw = body?.ids;
        const ids = Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
        const unique = [...new Set(ids)].slice(0, 50);
        const master = isMasterUser(user);
        const uid = actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;

        if (!master && (uid == null || Number.isNaN(Number(uid)))) {
            const e = new Error("No se pudo determinar la unidad organizacional del usuario");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const items = await consultaAprobadosRepo.getDocumentosByIdsInternal({
            ids: unique,
            userId: actor.id,
            unidadId: Number(uid),
            isMaster: master,
        });

        return { items };
    },
};

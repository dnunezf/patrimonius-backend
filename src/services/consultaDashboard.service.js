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

/** Lunes 00:00 a domingo (fecha) en hora local del servidor — rango para “esta semana”. */
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

export const consultaDashboardService = {
    async getResumen({ user, actor }) {
        const master = isMasterUser(user);
        const uid = actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;

        if (!master && (uid == null || Number.isNaN(Number(uid)))) {
            const e = new Error("No se pudo determinar la unidad organizacional del usuario");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const semana = rangoSemanaCalendarioLocal();

        const [recientes, descargasPorDocumento, novedades] = await Promise.all([
            consultaDashboardRepo.listUltimasDescargas({ userId: actor.id, limit: 3 }),
            consultaDashboardRepo.listDescargasAgregadas(actor.id),
            consultaAprobadosRepo.listNovedadesSemanaActual({
                userId: actor.id,
                unidadId: Number(uid),
                isMaster: master,
                dateFrom: semana.desde,
                dateTo: semana.hasta,
            }),
        ]);

        return {
            semana,
            recientes,
            descargasPorDocumento,
            novedades,
        };
    },

    async getHistorial({ query, actor }) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        return consultaDashboardRepo.listHistorial({
            userId: actor.id,
            page,
            pageSize,
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

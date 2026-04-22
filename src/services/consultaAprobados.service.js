// src/services/consultaAprobados.service.js
import { consultaAprobadosRepo } from "../repositories/consultaAprobados.repo.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";
import { documentoRepo } from "../repositories/documentoRepo.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import { historialBusquedaService } from "./historialBusqueda.service.js";
import { isConsultaMasterUser } from "../utils/consultaMaster.util.js";

/** Rol USUARIO_EXTERNO en seed (bd_patrimonius). */
const ROL_ID_EXTERNO = Number(process.env.ROL_ID_EXTERNO) || 5;

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

function esContextoConsultaExterno(extra) {
    return extra?.useExternoCatalog === true || extra?.external === true;
}

/**
 * Bitacora_Base.accion — nombres de consulta con sufijo I/E (interno / externo en pantalla).
 */
function buildConsultaAccionBase(accion, extra) {
    const esE = esContextoConsultaExterno(extra);
    const suf = esE ? "E" : "I";
    if (accion === "BUSQUEDA") return `BUSQUEDA_DOCUMENTO_${suf}`;
    if (accion === "DESCARGA") return `DESCARGA_DOCUMENTO_${suf}`;
    if (accion === "VISTA_PREVIA") return `VISTA_PREVIA_DOCUMENTO_${suf}`;
    const ext = esE ? "EXTERNO" : "INTERNO";
    return `CONSULTA_${String(accion)}_${ext}`;
}

/**
 * Texto en parametros / ciclo (etiqueta legada auxiliar).
 */
function buildConsultaAccionSolicitada(accion, extra) {
    const ext = esContextoConsultaExterno(extra) ? "EXTERNO" : "INTERNO";
    if (accion === "BUSQUEDA") return `BUSQUEDA_CATALOGO_APROBADOS_${ext}`;
    if (accion === "DESCARGA") return `DESCARGA_PDF_CONSULTA_${ext}`;
    return `CONSULTA_${String(accion)}_${ext}`;
}

function consultaSkipCicloDocumental(accion) {
    if (accion === "VISTA_PREVIA" || accion === "DESCARGA") return true;
    /** Búsqueda de catálogo (interna o externa): solo bitácora de actividad de usuario, no ciclo documental. */
    if (accion === "BUSQUEDA") return true;
    return false;
}

function recursoActividadConsulta(accion) {
    if (accion === "VISTA_PREVIA") return "CONSULTA_VISTA_PREVIA";
    if (accion === "DESCARGA") return "CONSULTA_DESCARGA";
    if (accion === "BUSQUEDA") return "CONSULTA_BUSQUEDA";
    return null;
}

function actividadEnumConsulta(accion) {
    if (accion === "VISTA_PREVIA") return "VISTA";
    if (accion === "DESCARGA") return "DESCARGA";
    if (accion === "BUSQUEDA") return "BUSQUEDA";
    return "NAVEGACION";
}

/**
 * Mismo criterio que documento.service safeAudit: snapshot fijo del documento para trazabilidad.
 */
async function buildConsultaDocumentoSnapshot(documento_id) {
    if (documento_id == null) return {};
    let snapshot = {};
    try {
        const doc = await documentoRepo.findById(documento_id);
        snapshot = {
            documento_titulo: doc?.titulo ?? null,
            documento_codigo_unico: doc?.numero_serie ?? null,
            documento_estado: doc?.estado ?? null,
        };
    } catch (_e) {
        snapshot = {};
    }
    try {
        if (typeof metadatoRepo.findByTipo === "function") {
            const codigoOficial = await metadatoRepo.findByTipo({
                documento_id,
                tipo: "CODIGO_OFICIAL",
            });
            snapshot.documento_codigo_oficial = codigoOficial?.valor ?? null;
        }
    } catch (_e) {
        snapshot.documento_codigo_oficial = null;
    }
    return snapshot;
}

async function logConsultaAprobados({ usuario_id, documento_id, accion, req, extra }) {
    const accionBase = buildConsultaAccionBase(accion, extra);
    const accionSolicitada = buildConsultaAccionSolicitada(accion, extra);

    const baseId = await bitacoraRepo.insertBase({
        fecha: new Date(),
        accion: accionBase,
        resultado: "PERMITIDO",
        usuario_id,
        documento_id: documento_id ?? null,
    });

    const recursoAct = recursoActividadConsulta(accion);
    if (recursoAct) {
        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: actividadEnumConsulta(accion),
            recurso: recursoAct,
            parametros: JSON.stringify({
                accion_solicitada: accionSolicitada,
                accion: accionBase,
                ...(extra || {}),
                path: req?.originalUrl ?? null,
                ip: req?.ip ?? null,
            }),
            accion: accionBase,
        });
    }

    if (consultaSkipCicloDocumental(accion)) {
        return;
    }

    const snapshot = await buildConsultaDocumentoSnapshot(documento_id);
    try {
        await bitacoraRepo.insertCiclo({
            id: baseId,
            evento: "CONSULTA",
            detalle: JSON.stringify({
                accion_solicitada: accionSolicitada,
                modulo: "CONSULTA_APROBADOS",
                tipo_operacion: accion,
                path: req?.originalUrl ?? null,
                ip: req?.ip ?? null,
                snapshot,
            }),
        });
    } catch (err) {
        console.warn("Consulta bitácora ciclo documental:", err?.message);
    }
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

        if (!isConsultaMasterUser(user)) {
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
                unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
                isMaster: isConsultaMasterUser(user),
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
                isMaster: isConsultaMasterUser(user),
                rolIds: actor.rolIds || [],
                filters,
                page,
                pageSize,
                sortBy,
                sortDir,
            });
        }

        const textoNormalizado = String(filters.q ?? "").trim();

        if (textoNormalizado && Number(result?.totalItems || 0) > 0) {
            try {
                await historialBusquedaService.registrarBusqueda({
                    usuario_id: actor.id,
                    texto_busqueda: textoNormalizado,
                    filtros: {
                        categoriaId: filters.categoriaId ?? null,
                        unidadId: filters.unidadId ?? null,
                        serieId: filters.serieId ?? null,
                        subserieId: filters.subserieId ?? null,
                        expedienteId: filters.expedienteId ?? null,
                        dateFrom: filters.dateFrom ?? null,
                        dateTo: filters.dateTo ?? null,
                        sortBy,
                        sortDir,
                        viewer: useExternoCatalog ? "externo" : "interno",
                    },
                });
            } catch (err) {
                console.warn("Historial de búsqueda:", err?.message);
            }
        }

        try {
            await logConsultaAprobados({
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
            console.warn("Consulta bitácora búsqueda:", err?.message);
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

        const master = isConsultaMasterUser(user);
        const uidInterno =
            actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;

        return {
            ...result,
            items,
            viewer: useExternoCatalog ? "externo" : "interno",
            totalDescargables: useExternoCatalog ? result.totalDescargables : undefined,
            /** No administrador consulta: documentos acotados a esta unidad (`Documento.unidad_id`). */
            filtroUnidadUsuario: master ? null : Number(uidInterno),
            aplicaFiltroUnidad: !master,
        };
    },

    async listFilters({ user, actor, query = {} }) {
        const useExternoCatalog =
            isExternalUser(user) ||
            (hasExternoRole(user) && wantsPanelExternoCatalog(query));
        if (useExternoCatalog) {
            if (!isConsultaMasterUser(user)) {
                const uid = actor?.unidadId ?? user?.unidadId ?? user?.unidad_id;
                if (uid == null || Number.isNaN(Number(uid))) {
                    const e = new Error("No se pudo determinar la unidad organizacional del usuario");
                    e.code = "BAD_REQUEST";
                    throw e;
                }
            }
            return consultaAprobadosRepo.listFiltersExterno({
                unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
                isMaster: isConsultaMasterUser(user),
            });
        }
        if (!isConsultaMasterUser(user)) {
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
            isMaster: isConsultaMasterUser(user),
        });
    },

    async assertCanAccess({ user, actor, documentoId, req, accion }) {
        const external = isExternalUser(user);
        const id = Number(documentoId);
        let ok;
        if (external) {
            ok = await consultaAprobadosRepo.existsForExternoPermisoDescarga({
                documentoId: id,
                userId: actor.id,
                unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
                isMaster: isConsultaMasterUser(user),
            });
        } else {
            ok = await consultaAprobadosRepo.existsForInternal({
                documentoId: id,
                userId: actor.id,
                unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
                isMaster: isConsultaMasterUser(user),
            });
            if (!ok && hasExternoRole(user)) {
                ok = await consultaAprobadosRepo.existsForExternoPermisoDescarga({
                    documentoId: id,
                    userId: actor.id,
                    unidadId: actor.unidadId ?? user?.unidadId ?? user?.unidad_id,
                    isMaster: isConsultaMasterUser(user),
                });
            }
        }
        if (!ok) {
            const e = new Error("Acceso no autorizado al documento");
            e.code = "FORBIDDEN";
            throw e;
        }
        const useExternoCatalog =
            isExternalUser(user) ||
            (hasExternoRole(user) && wantsPanelExternoCatalog(req?.query || {}));
        try {
            await logConsultaAprobados({
                usuario_id: actor.id,
                documento_id: id,
                accion,
                req,
                extra: { useExternoCatalog },
            });
        } catch (err) {
            console.warn("Consulta bitácora acción:", err?.message);
        }
    },
};

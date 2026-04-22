import expedienteRepo from "../repositories/expedienteRepo.js";
import {
    insertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId,
} from "../repositories/bitacoraExpedienteRepo.js";
import CatalogoSerieRepo from "../repositories/CatalogoSerieRepo.js";
import CatalogoSubserieRepo from "../repositories/CatalogoSubserieRepo.js";
import { pool } from '../db/pool.js';
import archiver from "archiver";
import { consultaAprobadosRepo } from "../repositories/consultaAprobados.repo.js";
import { consultaAprobadosService } from "./consultaAprobados.service.js";
import { documentoService } from "./documento.service.js";
import { isConsultaMasterUser } from "../utils/consultaMaster.util.js";

function wantsPanelExternoCatalog(query) {
    const v = query?.panelExterno ?? query?.externoCatalogo;
    const s = String(v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}

function ensureId(id) {
    const value = Number(id);
    if (!Number.isFinite(value)) {
        const e = new Error("ID inválido");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return value;
}

function ensureCodigo(codigo) {
    const c = (codigo ?? "").trim();
    if (!c) {
        const e = new Error("El código es obligatorio");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return c;
}

function ensureNombre(nombre) {
    const n = (nombre ?? "").trim();
    if (!n) {
        const e = new Error("El nombre es obligatorio");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return n;
}

function ensureUnidadId(unidadId) {
    const value = Number(unidadId);
    if (!Number.isFinite(value)) {
        const e = new Error("La unidad organizacional es obligatoria");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return value;
}

function ensureSerieId(serieId) {
    const value = Number(serieId);
    if (!Number.isFinite(value)) {
        const e = new Error("La serie es obligatoria");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return value;
}

function normalizeNullableId(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const n = Number(value);
    if (!Number.isFinite(n)) {
        const e = new Error("ID inválido");
        e.code = "BAD_REQUEST";
        throw e;
    }

    return n;
}

async function ensureUnidadExists(unidadId) {
    const [rows] = await pool.query(`
        SELECT id
        FROM Unidad_Organizacional
        WHERE id = ?
        LIMIT 1
    `, [unidadId]);

    if (!rows.length) {
        const e = new Error("La unidad organizacional indicada no existe");
        e.code = "NOT_FOUND";
        throw e;
    }
}

async function ensureUsuarioExists(userId) {
    if (userId === null) return;

    const [rows] = await pool.query(`
        SELECT id
        FROM Usuario
        WHERE id = ?
        LIMIT 1
    `, [userId]);

    if (!rows.length) {
        const e = new Error("El usuario creador indicado no existe");
        e.code = "NOT_FOUND";
        throw e;
    }
}

function resolveActorUserId(actorUserId, fallbackId) {
    const a = Number(actorUserId);
    if (Number.isFinite(a) && a > 0) {
        return a;
    }
    const f = Number(fallbackId);
    if (Number.isFinite(f) && f > 0) {
        return f;
    }
    const sys = Number(process.env.SYSTEM_USER_ID);
    if (Number.isFinite(sys) && sys > 0) {
        return sys;
    }
    return null;
}

function normalizeScalar(v) {
    if (v === null || v === undefined) {
        return "";
    }
    if (v instanceof Date) {
        return v.toISOString();
    }
    return String(v);
}

function buildExpedienteCambios(before, after) {
    const keys = [
        "codigo",
        "nombre",
        "descripcion",
        "unidad_id",
        "serie_id",
        "subserie_id",
        "estado",
        "fecha_cierre",
    ];
    const cambios = {};
    for (const k of keys) {
        if (normalizeScalar(before[k]) !== normalizeScalar(after[k])) {
            cambios[k] = {
                anterior: before[k] ?? null,
                nuevo: after[k] ?? null,
            };
        }
    }
    return Object.keys(cambios).length ? cambios : null;
}

export const expedienteService = {
    async create(dto, options = {}) {
        try {
            const codigo = ensureCodigo(dto?.codigo);
            const nombre = ensureNombre(dto?.nombre);
            const descripcion = dto?.descripcion ?? null;
            const unidad_id = ensureUnidadId(dto?.unidad_id);
            const serie_id = ensureSerieId(dto?.serie_id);
            const subserie_id = normalizeNullableId(dto?.subserie_id);
            const estado = dto?.estado ?? "ACTIVO";
            const created_by = normalizeNullableId(dto?.created_by);

            const duplicated = await expedienteRepo.existsByCodigo(codigo);
            if (duplicated) {
                const e = new Error("Ya existe un expediente con ese código");
                e.code = "ER_DUP_ENTRY";
                throw e;
            }

            await ensureUnidadExists(unidad_id);
            await ensureUsuarioExists(created_by);

            const serie = await CatalogoSerieRepo.getById(serie_id);
            if (!serie) {
                const e = new Error("La serie indicada no existe");
                e.code = "NOT_FOUND";
                throw e;
            }

            if (Number(serie.unidad_id) !== unidad_id) {
                const e = new Error("La serie no pertenece a la unidad organizacional indicada");
                e.code = "BAD_REQUEST";
                throw e;
            }

            if (subserie_id !== null) {
                const subserie = await CatalogoSubserieRepo.getById(subserie_id);
                if (!subserie) {
                    const e = new Error("La subserie indicada no existe");
                    e.code = "NOT_FOUND";
                    throw e;
                }

                if (Number(subserie.serie_id) !== serie_id) {
                    const e = new Error("La subserie no pertenece a la serie indicada");
                    e.code = "BAD_REQUEST";
                    throw e;
                }
            }

            const created = await expedienteRepo.create({
                codigo,
                nombre,
                descripcion,
                unidad_id,
                serie_id,
                subserie_id,
                estado,
                created_by
            });

            const actorId = resolveActorUserId(options?.actorUserId, created_by);
            await insertBitacoraExpedienteSafe({
                expediente_id: created.id,
                usuario_id: actorId,
                evento: "CREACION",
                resultado: "PERMITIDO",
                estado_anterior: null,
                estado_nuevo: created.estado ?? null,
                detalle: {
                    snapshot: {
                        codigo: created.codigo,
                        nombre: created.nombre,
                        descripcion: created.descripcion,
                        unidad_id: created.unidad_id,
                        serie_id: created.serie_id,
                        subserie_id: created.subserie_id,
                        estado: created.estado,
                    },
                },
            });

            return created;
        } catch (e) {
            if (e?.code === 409 || e?.code === "ER_DUP_ENTRY") {
                const err = new Error("Ya existe un expediente con ese código");
                err.code = "ER_DUP_ENTRY";
                throw err;
            }
            if (e?.code === 400 || e?.code === "BAD_REQUEST") {
                const err = new Error(e.message || "Datos inválidos");
                err.code = "BAD_REQUEST";
                throw err;
            }
            throw e;
        }
    },

    async list(filters = {}) {
        const hasFilters =
            filters?.unidad_id !== undefined ||
            filters?.serie_id !== undefined ||
            filters?.subserie_id !== undefined ||
            filters?.estado !== undefined;

        if (!hasFilters) {
            return await expedienteRepo.getAll();
        }

        return await expedienteRepo.getByFilters(filters);
    },

    async getById(id, options = {}) {
        const value = ensureId(id);
        const item = await expedienteRepo.getById(value);

        if (!item) {
            const e = new Error("Expediente no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (options.auditVisita) {
            const uid = resolveBitacoraUsuarioId(options.actorUserId);
            if (uid) {
                const externo = wantsPanelExternoCatalog(options.query ?? {});
                await insertBitacoraExpedienteSafe({
                    expediente_id: item.id,
                    usuario_id: uid,
                    evento: "VISITA_PREVIA",
                    resultado: "PERMITIDO",
                    detalle: {
                        origen: options.visitaOrigen ?? "detalle_expediente",
                        tipo_acceso: externo ? "externo" : "interno",
                    },
                });
            }
        }

        return item;
    },

    async searchAccess({ userId, user, query = {} }) {
        const page = Number(query?.page || 1);
        const pageSize = Number(query?.pageSize || 10);

        const codigo = String(query?.codigo || "").trim();
        const nombre = String(query?.nombre || "").trim();
        const serieId = query?.serieId;
        const subserieId = query?.subserieId;
        const soloConElegibles = String(query?.soloConElegibles || "").trim();

        // Compatibilidad con el filtro general anterior
        const q = String(query?.q || "").trim();

        const sortBy = String(query?.sortBy || "nombre");
        const sortDir = String(query?.sortDir || "asc");

        if (wantsPanelExternoCatalog(query)) {
            const unidadExt = user?.unidadId ?? user?.unidad_id;
            if (!isConsultaMasterUser(user) && (unidadExt === undefined || unidadExt === null || String(unidadExt).trim() === "")) {
                const e = new Error("Unidad organizacional requerida para la búsqueda");
                e.code = "BAD_REQUEST";
                throw e;
            }
            return await expedienteRepo.searchAccess({
                userId,
                unidadId: unidadExt != null && String(unidadExt).trim() !== "" ? Number(unidadExt) : null,
                isMaster: isConsultaMasterUser(user),
                codigo,
                nombre,
                serieId,
                subserieId,
                soloConElegibles,
                q,
                page,
                pageSize,
                sortBy,
                sortDir,
            });
        }

        const unidadId = user?.unidadId ?? user?.unidad_id;
        if (!isConsultaMasterUser(user) && (unidadId === undefined || unidadId === null || String(unidadId).trim() === "")) {
            const e = new Error("Unidad organizacional requerida para la búsqueda");
            e.code = "BAD_REQUEST";
            throw e;
        }

        const dateFrom = String(query?.dateFrom || "").trim();
        const dateTo = String(query?.dateTo || "").trim();

        return await expedienteRepo.searchAccessInternal({
            userId,
            unidadId: Number(unidadId),
            isMaster: isConsultaMasterUser(user),
            codigo,
            nombre,
            serieId,
            subserieId,
            q,
            dateFrom,
            dateTo,
            page,
            pageSize,
            sortBy,
            sortDir,
        });
    },

    async update(id, patch, options = {}) {
        const expedienteId = ensureId(id);

        const existing = await expedienteRepo.getById(expedienteId);
        if (!existing) {
            const e = new Error("Expediente no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        const dto = {
            codigo: patch?.codigo !== undefined ? ensureCodigo(patch.codigo) : existing.codigo,
            nombre: patch?.nombre !== undefined ? ensureNombre(patch.nombre) : existing.nombre,
            descripcion: patch?.descripcion !== undefined ? patch.descripcion : existing.descripcion,
            unidad_id: patch?.unidad_id !== undefined ? ensureUnidadId(patch.unidad_id) : existing.unidad_id,
            serie_id: patch?.serie_id !== undefined ? ensureSerieId(patch.serie_id) : existing.serie_id,
            subserie_id: patch?.subserie_id !== undefined ? normalizeNullableId(patch.subserie_id) : existing.subserie_id,
            estado: patch?.estado !== undefined ? patch.estado : existing.estado,
            fecha_cierre: patch?.fecha_cierre !== undefined ? patch.fecha_cierre : existing.fecha_cierre
        };

        const duplicated = await expedienteRepo.existsByCodigo(dto.codigo);
        if (duplicated && Number(duplicated.id) !== expedienteId) {
            const e = new Error("Ya existe otro expediente con ese código");
            e.code = "ER_DUP_ENTRY";
            throw e;
        }

        await ensureUnidadExists(dto.unidad_id);

        const serie = await CatalogoSerieRepo.getById(dto.serie_id);
        if (!serie) {
            const e = new Error("La serie indicada no existe");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (Number(serie.unidad_id) !== Number(dto.unidad_id)) {
            const e = new Error("La serie no pertenece a la unidad organizacional indicada");
            e.code = "BAD_REQUEST";
            throw e;
        }

        if (dto.subserie_id !== null) {
            const subserie = await CatalogoSubserieRepo.getById(dto.subserie_id);
            if (!subserie) {
                const e = new Error("La subserie indicada no existe");
                e.code = "NOT_FOUND";
                throw e;
            }

            if (Number(subserie.serie_id) !== Number(dto.serie_id)) {
                const e = new Error("La subserie no pertenece a la serie indicada");
                e.code = "BAD_REQUEST";
                throw e;
            }
        }

        const updated = await expedienteRepo.update(expedienteId, dto);

        const cambios = buildExpedienteCambios(existing, updated);
        const actorId = resolveActorUserId(options?.actorUserId, null);

        const ex0 = String(existing.estado ?? "");
        const ex1 = String(updated.estado ?? "");
        const transicionCierre = ex0 !== "CERRADO" && ex1 === "CERRADO";
        const transicionAbrir = ex0 === "CERRADO" && ex1 === "ACTIVO";

        if (transicionCierre) {
            await insertBitacoraExpedienteSafe({
                expediente_id: expedienteId,
                usuario_id: actorId,
                evento: "CIERRE",
                resultado: "PERMITIDO",
                estado_anterior: existing.estado,
                estado_nuevo: updated.estado,
                detalle: cambios ? { cambios } : { cierre: true },
            });
        } else if (transicionAbrir) {
            await insertBitacoraExpedienteSafe({
                expediente_id: expedienteId,
                usuario_id: actorId,
                evento: "ABRIR",
                resultado: "PERMITIDO",
                estado_anterior: existing.estado,
                estado_nuevo: updated.estado,
                detalle: cambios ? { cambios } : { apertura: true },
            });
        } else if (cambios) {
            await insertBitacoraExpedienteSafe({
                expediente_id: expedienteId,
                usuario_id: actorId,
                evento: "ACTUALIZACION",
                resultado: "PERMITIDO",
                estado_anterior: existing.estado,
                estado_nuevo: updated.estado,
                detalle: { cambios },
            });
        }

        return updated;
    },

    async remove(id) {
        const expedienteId = ensureId(id);

        const existing = await expedienteRepo.getById(expedienteId);
        if (!existing) {
            const e = new Error("Expediente no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        try {
            const ok = await expedienteRepo.remove(expedienteId);
            if (!ok) {
                const e = new Error("Expediente no encontrado");
                e.code = "NOT_FOUND";
                throw e;
            }
            return true;
        } catch (e) {
            if (e?.code === "ER_ROW_IS_REFERENCED_2") {
                const [rows] = await pool.query(`
                    SELECT COUNT(*) AS total
                    FROM Documento
                    WHERE expediente_id = ?
                `, [expedienteId]);

                const total = rows[0]?.total ?? 0;

                if (total > 0) {
                    const err = new Error(
                        `No se puede eliminar el expediente porque está asociado a documentos (${total}).`
                    );
                    err.code = "CONFLICT";
                    err.meta = { total };
                    throw err;
                }

                const err = new Error(
                    "No se puede eliminar el expediente porque está referenciado por otra entidad (FK)."
                );
                err.code = "CONFLICT";
                throw err;
            }

            throw e;
        }
    },

    async getAccessibleDocumentsForExternal({ expedienteId, userId }) {
        const eid = ensureId(expedienteId);

        const expediente = await expedienteRepo.getById(eid);
        if (!expediente) {
            const e = new Error("Expediente no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        return await expedienteRepo.getAccessibleDocumentsForExternal({
            expedienteId: eid,
            userId,
        });
    },

    /**
     * Lista de documentos del expediente según panel externo (permisos) o reglas de consulta interna.
     */
    async getDocumentosAccesoExpediente({ expedienteId, user, query = {} }) {
        const eid = ensureId(expedienteId);

        const expediente = await expedienteRepo.getById(eid);
        if (!expediente) {
            const e = new Error("Expediente no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        if (wantsPanelExternoCatalog(query)) {
            return await expedienteRepo.getAccessibleDocumentsForExternal({
                expedienteId: eid,
                userId: user.id,
            });
        }

        return await consultaAprobadosRepo.listDocumentsByExpedienteInternal({
            expedienteId: eid,
            userId: user.id,
            unidadId: user.unidadId ?? user.unidad_id,
            isMaster: isConsultaMasterUser(user),
        });
    },

    /**
     * ZIP con los PDF de los documentos accesibles al usuario externo en el expediente
     * (misma lista que GET .../documentos-acceso). Registra descarga por documento.
     */
    async downloadExpedienteZip({ expedienteId, user, actor, req, res }) {
        const eid = ensureId(expedienteId);

        const expediente = await expedienteRepo.getById(eid);
        if (!expediente) {
            const e = new Error("Expediente no encontrado");
            e.code = "NOT_FOUND";
            throw e;
        }

        const q = req?.query || {};
        let rows;
        if (wantsPanelExternoCatalog(q)) {
            rows = await expedienteRepo.getAccessibleDocumentsForExternal({
                expedienteId: eid,
                userId: user.id,
            });
        } else {
            rows = await consultaAprobadosRepo.listDocumentsByExpedienteInternal({
                expedienteId: eid,
                userId: user.id,
                unidadId: user.unidadId ?? user.unidad_id,
                isMaster: isConsultaMasterUser(user),
            });
        }

        if (!rows.length) {
            const e = new Error(
                "No hay documentos disponibles para descargar en este expediente.",
            );
            e.code = "NOT_FOUND";
            throw e;
        }

        for (const doc of rows) {
            await consultaAprobadosService.assertCanAccess({
                user,
                actor,
                documentoId: doc.id,
                req,
                accion: "DESCARGA",
            });
        }

        const archive = archiver("zip", { zlib: { level: 9 } });

        const safeZip = String(expediente.codigo || `expediente_${eid}`).replace(
            /[^\w.\-]+/g,
            "_",
        );
        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${safeZip}.zip"`,
        );

        archive.pipe(res);

        const usedNames = new Set();
        for (const doc of rows) {
            const { filename, buffer } =
                await documentoService.getPdfBufferForConsultaPreview({
                    documento_id: doc.id,
                });
            let entry = String(filename || documentoService.buildConsultaPdfDownloadFilename(doc)).replace(
                /[/\\?*:|"<>]/g,
                "_",
            );
            if (usedNames.has(entry)) {
                const base = entry.replace(/\.pdf$/i, "");
                entry = `${base}_${doc.id}.pdf`;
            }
            usedNames.add(entry);
            archive.append(buffer, { name: entry });
        }

        await archive.finalize();

        const uidZip = resolveBitacoraUsuarioId(user?.id);
        if (uidZip) {
            const externoZip = wantsPanelExternoCatalog(q);
            await insertBitacoraExpedienteSafe({
                expediente_id: eid,
                usuario_id: uidZip,
                evento: "DESCARGA",
                resultado: "PERMITIDO",
                detalle: {
                    origen: "download_zip_expediente",
                    formato: "zip",
                    total_documentos: rows.length,
                    tipo_acceso: externoZip ? "externo" : "interno",
                },
            });
        }
    },
};
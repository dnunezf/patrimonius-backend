import CatalogoSubserieRepo from "../repositories/CatalogoSubserieRepo.js";
import CatalogoSerieRepo from "../repositories/CatalogoSerieRepo.js";
import { pool } from '../db/pool.js';

function ensureId(id) {
    const value = Number(id);
    if (!Number.isFinite(value)) {
        const e = new Error("ID inválido");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return value;
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

function ensureCodigo(codigo) {
    const c = (codigo ?? "").trim();
    if (!c) {
        const e = new Error("El código es obligatorio");
        e.code = "BAD_REQUEST";
        throw e;
    }
    return c;
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

async function ensureSerieExists(serieId) {
    const serie = await CatalogoSerieRepo.getById(serieId);
    if (!serie) {
        const e = new Error("La serie indicada no existe");
        e.code = "NOT_FOUND";
        throw e;
    }
    return serie;
}

export const CatalogoSubserieService = {
    async create(dto) {
        try {
            const codigo = ensureCodigo(dto?.codigo);
            const nombre = ensureNombre(dto?.nombre);
            const serie_id = ensureSerieId(dto?.serie_id);
            const descripcion = dto?.descripcion ?? null;
            const activa = dto?.activa ?? 1;

            await ensureSerieExists(serie_id);

            const duplicated = await CatalogoSubserieRepo.existsByCodigoAndSerie(codigo, serie_id);
            if (duplicated) {
                const e = new Error("Ya existe una subserie con ese código en la serie indicada");
                e.code = "ER_DUP_ENTRY";
                throw e;
            }

            return await CatalogoSubserieRepo.create({
                codigo,
                nombre,
                descripcion,
                serie_id,
                activa
            });
        } catch (e) {
            if (e?.code === 409 || e?.code === "ER_DUP_ENTRY") {
                const err = new Error("Ya existe una subserie con ese código en la serie indicada");
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

    async list(serieId) {
        if (serieId !== undefined && serieId !== null && serieId !== "") {
            return await CatalogoSubserieRepo.getBySerieId(ensureSerieId(serieId));
        }

        const list = await CatalogoSubserieRepo.getAll();
        return list.map(r => ({
            id: r.id,
            codigo: r.codigo,
            nombre: r.nombre,
            descripcion: r.descripcion ?? null,
            serie_id: r.serie_id,
            serie_nombre: r.serie_nombre ?? null,
            unidad_id: r.unidad_id ?? null,
            activa: r.activa,
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
    },

    async getById(id) {
        const value = ensureId(id);
        const item = await CatalogoSubserieRepo.getById(value);

        if (!item) {
            const e = new Error("Subserie no encontrada");
            e.code = "NOT_FOUND";
            throw e;
        }

        return item;
    },

    async update(id, patch) {
        const subserieId = ensureId(id);

        const existing = await CatalogoSubserieRepo.getById(subserieId);
        if (!existing) {
            const e = new Error("Subserie no encontrada");
            e.code = "NOT_FOUND";
            throw e;
        }

        const dto = {
            codigo: patch?.codigo !== undefined ? ensureCodigo(patch.codigo) : existing.codigo,
            nombre: patch?.nombre !== undefined ? ensureNombre(patch.nombre) : existing.nombre,
            descripcion: patch?.descripcion !== undefined ? patch.descripcion : existing.descripcion,
            serie_id: patch?.serie_id !== undefined ? ensureSerieId(patch.serie_id) : existing.serie_id,
            activa: patch?.activa !== undefined ? patch.activa : existing.activa
        };

        await ensureSerieExists(dto.serie_id);

        const duplicated = await CatalogoSubserieRepo.existsByCodigoAndSerie(dto.codigo, dto.serie_id);
        if (duplicated && Number(duplicated.id) !== subserieId) {
            const e = new Error("Ya existe otra subserie con ese código en la serie indicada");
            e.code = "ER_DUP_ENTRY";
            throw e;
        }

        return await CatalogoSubserieRepo.update(subserieId, dto);
    },

    async remove(id) {
        const subserieId = ensureId(id);

        const existing = await CatalogoSubserieRepo.getById(subserieId);
        if (!existing) {
            const e = new Error("Subserie no encontrada");
            e.code = "NOT_FOUND";
            throw e;
        }

        const [expedientesRows] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM Expediente
            WHERE subserie_id = ?
        `, [subserieId]);

        if ((expedientesRows[0]?.total ?? 0) > 0) {
            const e = new Error("No se puede eliminar la subserie porque tiene expedientes asociados");
            e.code = "CONFLICT";
            throw e;
        }

        const ok = await CatalogoSubserieRepo.remove(subserieId);
        if (!ok) {
            const e = new Error("Subserie no encontrada");
            e.code = "NOT_FOUND";
            throw e;
        }

        return true;
    }
};
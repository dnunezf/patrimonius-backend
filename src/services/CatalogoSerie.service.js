import CatalogoSerieRepo from '../repositories/CatalogoSerieRepo.js';
import { pool } from '../db/pool.js';

function ensureId(id) {
    const value = Number(id);
    if (!Number.isFinite(value)) {
        const e = new Error('ID inválido');
        e.code = 'BAD_REQUEST';
        throw e;
    }
    return value;
}

function ensureCodigo(codigo) {
    const c = (codigo ?? '').trim();
    if (!c) {
        const e = new Error('El código es obligatorio');
        e.code = 'BAD_REQUEST';
        throw e;
    }
    return c;
}

function ensureNombre(nombre) {
    const n = (nombre ?? '').trim();
    if (!n) {
        const e = new Error('El nombre es obligatorio');
        e.code = 'BAD_REQUEST';
        throw e;
    }
    return n;
}

function ensureUnidadId(unidadId) {
    const value = Number(unidadId);
    if (!Number.isFinite(value)) {
        const e = new Error('La unidad organizacional es obligatoria');
        e.code = 'BAD_REQUEST';
        throw e;
    }
    return value;
}

function ensurePlazoConservacionAnios(plazo) {
    const value = Number(plazo);

    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        const e = new Error('El plazo de conservación en años es obligatorio y debe ser un entero mayor que 0');
        e.code = 'BAD_REQUEST';
        throw e;
    }

    return value;
}

async function ensureUnidadExists(unidadId) {
    const [rows] = await pool.query(`
        SELECT id
        FROM Unidad_Organizacional
        WHERE id = ?
        LIMIT 1
    `, [unidadId]);

    if (!rows.length) {
        const e = new Error('La unidad organizacional indicada no existe');
        e.code = 'NOT_FOUND';
        throw e;
    }
}

export const CatalogoSerieService = {
    async list(unidadId) {
        if (unidadId !== undefined && unidadId !== null && unidadId !== '') {
            const unidad_id = ensureUnidadId(unidadId);
            return await CatalogoSerieRepo.getByUnidadId(unidad_id);
        }

        return await CatalogoSerieRepo.getAll();
    },

    async getById(id) {
        const serieId = ensureId(id);
        const item = await CatalogoSerieRepo.getById(serieId);

        if (!item) {
            const e = new Error('Serie no encontrada');
            e.code = 'NOT_FOUND';
            throw e;
        }

        return item;
    },

    async create(dto) {
        const codigo = ensureCodigo(dto?.codigo);
        const nombre = ensureNombre(dto?.nombre);
        const unidad_id = ensureUnidadId(dto?.unidad_id);
        const descripcion = dto?.descripcion ?? null;
        const plazo_conservacion_anios = ensurePlazoConservacionAnios(dto?.plazo_conservacion_anios);
        const activa = dto?.activa ?? 1;

        await ensureUnidadExists(unidad_id);

        const duplicated = await CatalogoSerieRepo.existsByCodigoAndUnidad(codigo, unidad_id);
        if (duplicated) {
            const e = new Error('Ya existe una serie con ese código en la unidad organizacional');
            e.code = 'ER_DUP_ENTRY';
            throw e;
        }

        return await CatalogoSerieRepo.create({
            codigo,
            nombre,
            descripcion,
            unidad_id,
            plazo_conservacion_anios,
            activa
        });
    },

    async update(id, patch) {
        const serieId = ensureId(id);

        const existing = await CatalogoSerieRepo.getById(serieId);
        if (!existing) {
            const e = new Error('Serie no encontrada');
            e.code = 'NOT_FOUND';
            throw e;
        }

        const codigo = patch?.codigo !== undefined ? ensureCodigo(patch.codigo) : existing.codigo;
        const nombre = patch?.nombre !== undefined ? ensureNombre(patch.nombre) : existing.nombre;
        const descripcion = patch?.descripcion !== undefined ? patch.descripcion : existing.descripcion;
        const unidad_id = patch?.unidad_id !== undefined ? ensureUnidadId(patch.unidad_id) : existing.unidad_id;
        const plazo_conservacion_anios = patch?.plazo_conservacion_anios !== undefined
            ? ensurePlazoConservacionAnios(patch.plazo_conservacion_anios)
            : existing.plazo_conservacion_anios;
        const activa = patch?.activa !== undefined ? patch.activa : existing.activa;

        await ensureUnidadExists(unidad_id);

        const duplicated = await CatalogoSerieRepo.existsByCodigoAndUnidad(codigo, unidad_id);
        if (duplicated && Number(duplicated.id) !== serieId) {
            const e = new Error('Ya existe otra serie con ese código en la unidad organizacional');
            e.code = 'ER_DUP_ENTRY';
            throw e;
        }

        return await CatalogoSerieRepo.update(serieId, {
            codigo,
            nombre,
            descripcion,
            unidad_id,
            plazo_conservacion_anios,
            activa
        });
    },

    async remove(id) {
        const serieId = ensureId(id);

        const existing = await CatalogoSerieRepo.getById(serieId);
        if (!existing) {
            const e = new Error('Serie no encontrada');
            e.code = 'NOT_FOUND';
            throw e;
        }

        const [subseriesRows] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM Subserie
            WHERE serie_id = ?
        `, [serieId]);

        if ((subseriesRows[0]?.total ?? 0) > 0) {
            const e = new Error('No se puede eliminar la serie porque tiene subseries asociadas');
            e.code = 'CONFLICT';
            throw e;
        }

        const [expedientesRows] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM Expediente
            WHERE serie_id = ?
        `, [serieId]);

        if ((expedientesRows[0]?.total ?? 0) > 0) {
            const e = new Error('No se puede eliminar la serie porque tiene expedientes asociados');
            e.code = 'CONFLICT';
            throw e;
        }

        const ok = await CatalogoSerieRepo.remove(serieId);
        if (!ok) {
            const e = new Error('Serie no encontrada');
            e.code = 'NOT_FOUND';
            throw e;
        }

        return true;
    }
};
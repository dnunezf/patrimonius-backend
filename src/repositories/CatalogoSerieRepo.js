import { pool } from '../db/pool.js';

const CatalogoSerieRepo = {
    async getAll() {
        const [rows] = await pool.query(`
            SELECT
                s.id,
                s.codigo,
                s.nombre,
                s.descripcion,
                s.unidad_id,
                u.nombre AS unidad_nombre,
                s.plazo_conservacion_anios,
                s.activa,
                s.created_at,
                s.updated_at
            FROM Serie s
                     INNER JOIN Unidad_Organizacional u ON u.id = s.unidad_id
            ORDER BY s.nombre ASC
        `);
        return rows;
    },

    async getById(id) {
        const [rows] = await pool.query(`
            SELECT
                s.id,
                s.codigo,
                s.nombre,
                s.descripcion,
                s.unidad_id,
                u.nombre AS unidad_nombre,
                s.plazo_conservacion_anios,
                s.activa,
                s.created_at,
                s.updated_at
            FROM Serie s
                     INNER JOIN Unidad_Organizacional u ON u.id = s.unidad_id
            WHERE s.id = ?
                LIMIT 1
        `, [id]);

        return rows[0] || null;
    },

    async getByUnidadId(unidadId) {
        const [rows] = await pool.query(`
            SELECT
                id,
                codigo,
                nombre,
                descripcion,
                unidad_id,
                plazo_conservacion_anios,
                activa,
                created_at,
                updated_at
            FROM Serie
            WHERE unidad_id = ?
            ORDER BY nombre ASC
        `, [unidadId]);

        return rows;
    },

    async create({ codigo, nombre, descripcion, unidad_id, plazo_conservacion_anios, activa = 1 }) {
        const [result] = await pool.query(`
            INSERT INTO Serie (codigo, nombre, descripcion, unidad_id, plazo_conservacion_anios, activa)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [codigo, nombre, descripcion ?? null, unidad_id, plazo_conservacion_anios ?? null, activa]);

        return this.getById(result.insertId);
    },

    async update(id, { codigo, nombre, descripcion, unidad_id, plazo_conservacion_anios, activa }) {
        await pool.query(`
            UPDATE Serie
            SET
                codigo = ?,
                nombre = ?,
                descripcion = ?,
                unidad_id = ?,
                plazo_conservacion_anios = ?,
                activa = ?
            WHERE id = ?
        `, [codigo, nombre, descripcion ?? null, unidad_id, plazo_conservacion_anios ?? null, activa, id]);

        return this.getById(id);
    },

    async remove(id) {
        const [result] = await pool.query(`
            DELETE FROM Serie
            WHERE id = ?
        `, [id]);

        return result.affectedRows > 0;
    },

    async existsByCodigoAndUnidad(codigo, unidadId) {
        const [rows] = await pool.query(`
            SELECT id
            FROM Serie
            WHERE codigo = ? AND unidad_id = ?
                LIMIT 1
        `, [codigo, unidadId]);

        return rows[0] || null;
    }
};

export default CatalogoSerieRepo;
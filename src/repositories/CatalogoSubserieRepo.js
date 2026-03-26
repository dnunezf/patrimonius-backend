import { pool } from '../db/pool.js';

const CatalogoSubserieRepo = {
    async getAll() {
        const [rows] = await pool.query(`
      SELECT
        ss.id,
        ss.codigo,
        ss.nombre,
        ss.descripcion,
        ss.serie_id,
        s.nombre AS serie_nombre,
        s.unidad_id,
        ss.activa,
        ss.created_at,
        ss.updated_at
      FROM Subserie ss
      INNER JOIN Serie s ON s.id = ss.serie_id
      ORDER BY ss.nombre ASC
    `);

        return rows;
    },

    async getById(id) {
        const [rows] = await pool.query(`
      SELECT
        ss.id,
        ss.codigo,
        ss.nombre,
        ss.descripcion,
        ss.serie_id,
        s.nombre AS serie_nombre,
        s.unidad_id,
        ss.activa,
        ss.created_at,
        ss.updated_at
      FROM Subserie ss
      INNER JOIN Serie s ON s.id = ss.serie_id
      WHERE ss.id = ?
      LIMIT 1
    `, [id]);

        return rows[0] || null;
    },

    async getBySerieId(serieId) {
        const [rows] = await pool.query(`
      SELECT
        id,
        codigo,
        nombre,
        descripcion,
        serie_id,
        activa,
        created_at,
        updated_at
      FROM Subserie
      WHERE serie_id = ?
      ORDER BY nombre ASC
    `, [serieId]);

        return rows;
    },

    async create({ codigo, nombre, descripcion, serie_id, activa = 1 }) {
        const [result] = await pool.query(`
      INSERT INTO Subserie (codigo, nombre, descripcion, serie_id, activa)
      VALUES (?, ?, ?, ?, ?)
    `, [codigo, nombre, descripcion ?? null, serie_id, activa]);

        return this.getById(result.insertId);
    },

    async update(id, { codigo, nombre, descripcion, serie_id, activa }) {
        await pool.query(`
      UPDATE Subserie
      SET
        codigo = ?,
        nombre = ?,
        descripcion = ?,
        serie_id = ?,
        activa = ?
      WHERE id = ?
    `, [codigo, nombre, descripcion ?? null, serie_id, activa, id]);

        return this.getById(id);
    },

    async remove(id) {
        const [result] = await pool.query(`
      DELETE FROM Subserie
      WHERE id = ?
    `, [id]);

        return result.affectedRows > 0;
    },

    async existsByCodigoAndSerie(codigo, serieId) {
        const [rows] = await pool.query(`
      SELECT id
      FROM Subserie
      WHERE codigo = ? AND serie_id = ?
      LIMIT 1
    `, [codigo, serieId]);

        return rows[0] || null;
    }
};

export default CatalogoSubserieRepo;
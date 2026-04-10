import { pool } from '../db/pool.js';

const expedienteRepo = {
    async getAll() {
        const [rows] = await pool.query(`
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.fecha_creacion,
        e.fecha_cierre,
        e.descripcion,
        e.estado,
        e.unidad_id,
        e.serie_id,
        e.subserie_id,
        e.created_by,
        e.updated_at,
        u.nombre AS unidad_nombre,
        s.nombre AS serie_nombre,
        ss.nombre AS subserie_nombre
      FROM Expediente e
      INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
      INNER JOIN Serie s ON s.id = e.serie_id
      LEFT JOIN Subserie ss ON ss.id = e.subserie_id
      ORDER BY e.fecha_creacion DESC
    `);

        return rows;
    },

    async getById(id) {
        const [rows] = await pool.query(`
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.fecha_creacion,
        e.fecha_cierre,
        e.descripcion,
        e.estado,
        e.unidad_id,
        e.serie_id,
        e.subserie_id,
        e.created_by,
        e.updated_at,
        u.nombre AS unidad_nombre,
        s.nombre AS serie_nombre,
        ss.nombre AS subserie_nombre
      FROM Expediente e
      INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
      INNER JOIN Serie s ON s.id = e.serie_id
      LEFT JOIN Subserie ss ON ss.id = e.subserie_id
      WHERE e.id = ?
      LIMIT 1
    `, [id]);

        return rows[0] || null;
    },

    async getByFilters({ unidad_id, serie_id, subserie_id, estado }) {
        let sql = `
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.fecha_creacion,
        e.fecha_cierre,
        e.descripcion,
        e.estado,
        e.unidad_id,
        e.serie_id,
        e.subserie_id,
        e.created_by,
        e.updated_at
      FROM Expediente e
      WHERE 1 = 1
    `;
        const params = [];

        if (unidad_id) {
            sql += ` AND e.unidad_id = ?`;
            params.push(unidad_id);
        }

        if (serie_id) {
            sql += ` AND e.serie_id = ?`;
            params.push(serie_id);
        }

        if (subserie_id !== undefined && subserie_id !== null && subserie_id !== '') {
            sql += ` AND e.subserie_id = ?`;
            params.push(subserie_id);
        }

        if (estado) {
            sql += ` AND e.estado = ?`;
            params.push(estado);
        }

        sql += ` ORDER BY e.nombre ASC`;

        const [rows] = await pool.query(sql, params);
        return rows;
    },

    async create({
                     codigo,
                     nombre,
                     descripcion,
                     unidad_id,
                     serie_id,
                     subserie_id,
                     estado = 'ACTIVO',
                     created_by = null
                 }) {
        const [result] = await pool.query(`
      INSERT INTO Expediente (
        codigo,
        nombre,
        descripcion,
        unidad_id,
        serie_id,
        subserie_id,
        estado,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            codigo,
            nombre,
            descripcion ?? null,
            unidad_id,
            serie_id,
            subserie_id ?? null,
            estado,
            created_by
        ]);

        return this.getById(result.insertId);
    },

    async update(id, {
        codigo,
        nombre,
        descripcion,
        unidad_id,
        serie_id,
        subserie_id,
        estado,
        fecha_cierre
    }) {
        await pool.query(`
      UPDATE Expediente
      SET
        codigo = ?,
        nombre = ?,
        descripcion = ?,
        unidad_id = ?,
        serie_id = ?,
        subserie_id = ?,
        estado = ?,
        fecha_cierre = ?
      WHERE id = ?
    `, [
            codigo,
            nombre,
            descripcion ?? null,
            unidad_id,
            serie_id,
            subserie_id ?? null,
            estado,
            fecha_cierre ?? null,
            id
        ]);

        return this.getById(id);
    },

    async remove(id) {
        const [result] = await pool.query(`
      DELETE FROM Expediente
      WHERE id = ?
    `, [id]);

        return result.affectedRows > 0;
    },

    async existsByCodigo(codigo) {
        const [rows] = await pool.query(`
      SELECT id
      FROM Expediente
      WHERE codigo = ?
      LIMIT 1
    `, [codigo]);

        return rows[0] || null;
    }
};

export default expedienteRepo;
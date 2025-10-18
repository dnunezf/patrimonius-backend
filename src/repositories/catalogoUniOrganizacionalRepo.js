// src/repositories/catalogoUniOrganizacionalRepo.js
import { pool } from "../db/pool.js";

const TABLE = "Unidad_Organizacional";

const mapRow = (r) => ({
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
});

const findAll = async () => {
    const [rows] = await pool.query(
        `SELECT id, nombre, descripcion FROM ${TABLE} ORDER BY id ASC`
    );
    return rows.map(mapRow);
};

const findById = async (id) => {
    const [rows] = await pool.query(
        `SELECT id, nombre, descripcion FROM ${TABLE} WHERE id = ? LIMIT 1`,
        [id]
    );
    return rows.length ? mapRow(rows[0]) : null;
};

const create = async ({ nombre, descripcion }) => {
    if (!nombre) throw new Error("El nombre es obligatorio");
    const [res] = await pool.query(
        `INSERT INTO ${TABLE} (nombre, descripcion) VALUES (?, ?)`,
        [nombre, descripcion ?? null]
    );
    return findById(res.insertId); // ← devuelve objeto creado
};

const update = async (id, { nombre, descripcion }) => {
    if (!id) throw new Error("ID obligatorio");

    // build dinámico para PATCH
    const fields = [];
    const values = [];
    if (nombre !== undefined) {
        fields.push("nombre = ?");
        values.push(nombre);
    }
    if (descripcion !== undefined) {
        fields.push("descripcion = ?");
        values.push(descripcion);
    }

    // si no hay campos, solo retorna el actual
    if (fields.length === 0) return findById(id);

    values.push(id);
    const sql = `UPDATE ${TABLE} SET ${fields.join(", ")} WHERE id = ?`;
    const [res] = await pool.query(sql, values);
    if (res.affectedRows === 0) return null;

    return findById(id); // ← devuelve objeto actualizado
};

const remove = async (id) => {
    if (!id) throw new Error("ID obligatorio para eliminar");
    const [res] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return res.affectedRows > 0; // ← true si se eliminó
};

export const catalogoUniOrganizacionalRepo = {
    findAll,
    findById,
    create,
    update,
    remove,
};

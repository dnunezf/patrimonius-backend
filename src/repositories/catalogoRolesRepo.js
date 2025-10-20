// src/repositories/catalogoRolesRepo.js
import { pool } from "../db/pool.js";

const TABLE = "rol"; // 👈 coincide con tus INSERTs

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

const findByName = async (nombre) => {
    const [rows] = await pool.query(
        `SELECT id, nombre, descripcion FROM ${TABLE} WHERE nombre = ? LIMIT 1`,
        [nombre]
    );
    return rows.length ? mapRow(rows[0]) : null;
};

const create = async ({ nombre, descripcion }) => {
    if (!nombre?.trim()) {
        const e = new Error("El nombre es obligatorio");
        e.code = 400;
        throw e;
    }

    // (opcional) evitar duplicados por nombre si no tienes UNIQUE en BD
    // const existing = await findByName(nombre.trim());
    // if (existing) {
    //   const e = new Error("Ya existe un rol con ese nombre");
    //   e.code = 409;
    //   throw e;
    // }

    try {
        const [res] = await pool.query(
            `INSERT INTO ${TABLE} (nombre, descripcion) VALUES (?, ?)`,
            [nombre.trim(), descripcion ?? null]
        );
        return await findById(res.insertId); // devuelve objeto creado
    } catch (error) {
        // Si tienes UNIQUE(nombre) y hay duplicado, MySQL lanza ER_DUP_ENTRY
        if (error?.code === "ER_DUP_ENTRY") {
            const e = new Error("Ya existe un rol con ese nombre");
            e.code = 409;
            throw e;
        }
        console.error("Error al crear rol:", error);
        throw error;
    }
};

const update = async (id, patch = {}) => {
    if (!id) {
        const e = new Error("ID inválido");
        e.code = 400;
        throw e;
    }

    // Construcción dinámica para PATCH parcial
    const fields = [];
    const values = [];

    if (patch.nombre !== undefined) {
        fields.push("nombre = ?");
        values.push(patch.nombre?.trim() ?? null);
    }
    if (patch.descripcion !== undefined) {
        fields.push("descripcion = ?");
        values.push(patch.descripcion);
    }

    if (!fields.length) {
        // nada que actualizar, retorna el actual
        return await findById(id);
    }

    values.push(id);
    const [res] = await pool.query(
        `UPDATE ${TABLE} SET ${fields.join(", ")} WHERE id = ?`,
        values
    );
    if (!res.affectedRows) return null;

    return await findById(id); // devuelve objeto actualizado
};

const remove = async (id) => {
    const [res] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return res.affectedRows > 0;
};

export const catalogoRolesRepo = {
    create,
    findAll,
    findById,
    findByName,
    update,
    remove,
};

// src/repositories/catalogoRolesRepo.js
import { pool } from "../db/pool.js";

const TABLE = "Rol"; // 👈 OJO: en tu script SQL es "Rol" (mayúscula inicial)

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

    try {
        const [res] = await pool.query(
            `INSERT INTO ${TABLE} (nombre, descripcion) VALUES (?, ?)`,
            [nombre.trim(), descripcion ?? null]
        );
        return await findById(res.insertId);
    } catch (error) {
        if (error?.code === "ER_DUP_ENTRY") {
            const e = new Error("Ya existe un rol con ese nombre");
            e.code = 409;
            throw e;
        }
        throw error;
    }
};

const update = async (id, patch = {}) => {
    if (!id) {
        const e = new Error("ID inválido");
        e.code = 400;
        throw e;
    }

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

    if (!fields.length) return await findById(id);

    values.push(id);
    const [res] = await pool.query(
        `UPDATE ${TABLE} SET ${fields.join(", ")} WHERE id = ?`,
        values
    );
    if (!res.affectedRows) return null;

    return await findById(id);
};

const remove = async (id) => {
    const [res] = await pool.query(
        `DELETE FROM ${TABLE} WHERE id = ?`,
        [id]
    );
    return res.affectedRows > 0;
};

/* ============================
   🔥 NUEVO: CONTADOR DE USO
   ============================ */
const countUsersUsingRole = async (rolId) => {
    const [[a]] = await pool.query(
        `SELECT COUNT(*) AS total FROM Usuario WHERE rol_id = ?`,
        [rolId]
    );

    const [[b]] = await pool.query(
        `SELECT COUNT(*) AS total FROM Usuario_Rol WHERE rol_id = ?`,
        [rolId]
    );

    return {
        primary: Number(a?.total ?? 0),
        extra: Number(b?.total ?? 0),
        total: Number(a?.total ?? 0) + Number(b?.total ?? 0),
    };
};

export const catalogoRolesRepo = {
    create,
    findAll,
    findById,
    findByName,
    update,
    remove,
    countUsersUsingRole, // 👈 exportado
};

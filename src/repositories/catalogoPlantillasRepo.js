// src/repositories/catalogoPlantillasRepo.js
import { pool } from "../db/pool.js";

/**
 * Estructura esperada en BD:
 * Plantilla(id INT PK AI, nombre VARCHAR, descripcion TEXT NULL, version VARCHAR, ruta_archivo VARCHAR UNIQUE)
 */

const create = async (dto) => {
    const { nombre, descripcion = null, version = "1.0", ruta_archivo } = dto;

    if (!nombre?.trim()) throw new Error("El nombre es obligatorio.");
    if (!version?.toString().trim()) throw new Error("La versión es obligatoria.");
    if (!ruta_archivo?.trim()) throw new Error("La ruta del archivo es obligatoria.");

    const sql = `
    INSERT INTO Plantilla (nombre, descripcion, version, ruta_archivo)
    VALUES (?, ?, ?, ?)
  `;
    const params = [nombre.trim(), descripcion, version.toString().trim(), ruta_archivo.trim()];

    const [result] = await pool.query(sql, params);
    return { id: result.insertId, nombre: nombre.trim(), descripcion, version: version.toString().trim(), ruta_archivo: ruta_archivo.trim() };
};

const findAll = async () => {
    const sql = `SELECT id, nombre, descripcion, version, ruta_archivo FROM Plantilla ORDER BY id DESC`;
    const [rows] = await pool.query(sql);
    return rows; // devolver [] si no hay
};

const findById = async (id) => {
    const sql = `SELECT id, nombre, descripcion, version, ruta_archivo FROM Plantilla WHERE id = ? LIMIT 1`;
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
};

/**
 * Update parcial (PATCH): arma SET dinámico con campos definidos.
 * Devuelve el registro actualizado o null si no existe.
 */
const update = async (id, dto = {}) => {
    const fields = [];
    const params = [];

    if (dto.nombre !== undefined) {
        fields.push("nombre = ?");
        params.push(dto.nombre?.trim() ?? null);
    }
    if (dto.descripcion !== undefined) {
        fields.push("descripcion = ?");
        params.push(dto.descripcion ?? null);
    }
    if (dto.version !== undefined) {
        fields.push("version = ?");
        params.push(dto.version?.toString().trim() ?? null);
    }
    if (dto.ruta_archivo !== undefined) {
        fields.push("ruta_archivo = ?");
        params.push(dto.ruta_archivo?.trim() ?? null);
    }

    if (fields.length === 0) {
        // nada que actualizar: devuelve el actual
        const current = await findById(id);
        return current;
    }

    const sql = `UPDATE Plantilla SET ${fields.join(", ")} WHERE id = ?`;
    params.push(id);

    const [res] = await pool.query(sql, params);
    if (res.affectedRows === 0) return null;

    return await findById(id);
};

const remove = async (id) => {
    const sql = `DELETE FROM Plantilla WHERE id = ?`;
    const [res] = await pool.query(sql, [id]);
    return res.affectedRows > 0; // true si borró, false si no existía
};

export const catalogoPlantillasRepo = {
    create,
    findAll,
    findById,
    update,
    remove,
};

// src/repositories/catalogoRolesRepo.js
import { pool } from "../db/pool.js";

// Crear un nuevo rol
const create = async (dto) => {
    const { nombre, descripcion } = dto;
    const query = `
    INSERT INTO Rol (nombre, descripcion)
    VALUES (?, ?)
  `;
    const values = [nombre, descripcion];

    const [result] = await pool.query(query, values);
    return { id: result.insertId, ...dto }; // Devolver el objeto creado con el ID asignado
};

// Obtener todos los roles
const findAll = async () => {
    const query = "SELECT * FROM Rol";
    const [rows] = await pool.query(query);
    return rows;
};

// Actualizar un rol
const update = async (id, dto) => {
    const { nombre, descripcion } = dto;
    const query = `
    UPDATE Rol
    SET nombre = ?, descripcion = ?
    WHERE id = ?
  `;
    const values = [nombre, descripcion, id];

    const [result] = await pool.query(query, values);
    return result.affectedRows > 0 ? { id, ...dto } : null;
};

// Eliminar un rol
const remove = async (id) => {
    const query = "DELETE FROM Rol WHERE id = ?";
    const values = [id];

    await pool.query(query, values);
};

export const catalogoRolesRepo = {
    create,
    findAll,
    update,
    remove,
};

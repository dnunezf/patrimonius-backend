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

    try {
        const [result] = await pool.query(query, values);
        return { id: result.insertId, ...dto };
    } catch (error) {
        console.error("Error al crear rol:", error);
        throw error;  // Lanza el error para que el servicio lo capture
    }
};

// Obtener todos los roles
const findAll = async () => {
    const query = "SELECT * FROM Rol";
    const [rows] = await pool.query(query);
    return rows;
};

// Buscar un rol por nombre
const findByName = async (nombre) => {
    const query = "SELECT * FROM Rol WHERE nombre = ?";
    const values = [nombre];

    const [rows] = await pool.query(query, values);
    return rows[0]; // Si hay un rol con ese nombre, devolver el primer resultado
};

// Buscar un rol por ID
const findById = async (id) => {
    const query = "SELECT * FROM Rol WHERE id = ?";
    const values = [id];

    const [rows] = await pool.query(query, values);
    return rows[0]; // Devolver el rol encontrado (si existe)
};

// Actualizar un rol
const update = async (id, dto) => {
    const { nombre, descripcion } = dto;

    // Verificar si el rol existe antes de actualizar
    const existingRole = await findById(id);
    if (!existingRole) {
        throw new Error("El rol que intenta actualizar no existe.");
    }

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

    try {
        const [result] = await pool.query(query, values);
        if (result.affectedRows === 0) {
            throw new Error("Rol no encontrado");
        }
    } catch (error) {
        console.error("Error al eliminar rol:", error);
        throw error;  // Lanza el error para que el servicio lo capture
    }
};

export const catalogoRolesRepo = {
    create,
    findAll,
    findByName,
    findById,
    update,
    remove,
};

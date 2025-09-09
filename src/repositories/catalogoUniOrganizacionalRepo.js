// src/repositories/catalogoUniOrganizacionalRepo.js
import { pool } from "../db/pool.js";

// Crear una nueva unidad organizacional
const create = async (dto) => {
    const { nombre, descripcion } = dto;
    const query = `
    INSERT INTO Unidad_Organizacional (nombre, descripcion)
    VALUES (?, ?)
  `;
    const values = [nombre, descripcion];

    const [result] = await pool.query(query, values);
    return { id: result.insertId, ...dto }; // Devolver el objeto creado con el ID asignado
};

// Obtener todas las unidades organizacionales
const findAll = async () => {
    const query = "SELECT * FROM Unidad_Organizacional";
    const [rows] = await pool.query(query);
    return rows;
};

// Actualizar una unidad organizacional
const update = async (id, dto) => {
    const { nombre, descripcion } = dto;
    const query = `
    UPDATE Unidad_Organizacional
    SET nombre = ?, descripcion = ?
    WHERE id = ?
  `;
    const values = [nombre, descripcion, id];

    const [result] = await pool.query(query, values);
    return result.affectedRows > 0 ? { id, ...dto } : null;
};

// Eliminar una unidad organizacional
const remove = async (id) => {
    const query = "DELETE FROM Unidad_Organizacional WHERE id = ?";
    const values = [id];

    await pool.query(query, values);
};

export const catalogoUniOrganizacionalRepo = {
    create,
    findAll,
    update,
    remove,
};

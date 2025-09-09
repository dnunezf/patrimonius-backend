// src/repositories/catalogoPlantillasRepo.js
import { pool } from "../db/pool.js"; // Asegúrate de tener la conexión a la base de datos configurada correctamente

// Crear una nueva plantilla
const create = async (dto) => {
    const { nombre, descripcion, ruta_archivo } = dto;
    const query = `
    INSERT INTO Plantilla (nombre, descripcion, ruta_archivo)
    VALUES (?, ?, ?)
  `;
    const values = [nombre, descripcion, ruta_archivo];

    const [result] = await pool.query(query, values);
    return { id: result.insertId, ...dto }; // Devolver el objeto creado con el ID asignado
};

// Obtener todas las plantillas
const findAll = async () => {
    const query = "SELECT * FROM Plantilla";
    const [rows] = await pool.query(query);
    return rows;
};

// Actualizar una plantilla
const update = async (id, dto) => {
    const { nombre, descripcion, ruta_archivo } = dto;
    const query = `
    UPDATE Plantilla
    SET nombre = ?, descripcion = ?, ruta_archivo = ?
    WHERE id = ?
  `;
    const values = [nombre, descripcion, ruta_archivo, id];

    const [result] = await pool.query(query, values);
    return result.affectedRows > 0 ? { id, ...dto } : null; // Devuelve la plantilla actualizada
};

// Eliminar una plantilla
const remove = async (id) => {
    const query = "DELETE FROM Plantilla WHERE id = ?";
    const values = [id];

    await pool.query(query, values);
};

export const catalogoPlantillasRepo = {
    create,
    findAll,
    update,
    remove,
};

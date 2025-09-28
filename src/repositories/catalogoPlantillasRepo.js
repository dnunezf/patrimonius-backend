// src/repositories/catalogoPlantillasRepo.js
import { pool } from "../db/pool.js"; // Asegúrate de tener la conexión a la base de datos configurada correctamente

// Crear una nueva plantilla
const create = async (dto) => {
    const { nombre, descripcion, ruta_archivo } = dto;

    if (!nombre || !descripcion || !ruta_archivo) {
        throw new Error("Todos los campos son requeridos.");
    }

    const query = `
        INSERT INTO Plantilla (nombre, descripcion, ruta_archivo)
        VALUES (?, ?, ?)
    `;
    const values = [nombre, descripcion, ruta_archivo];

    try {
        const [result] = await pool.query(query, values);
        return { id: result.insertId, ...dto }; // Devolver el objeto creado con el ID asignado
    } catch (error) {
        console.error("Error al crear plantilla:", error);
        throw new Error("Error al crear plantilla");
    }
};

// Obtener todas las plantillas
const findAll = async () => {
    const query = "SELECT * FROM Plantilla";
    try {
        const [rows] = await pool.query(query);
        return rows;
    } catch (error) {
        console.error("Error al obtener plantillas:", error);
        throw new Error("Error al obtener las plantillas");
    }
};

// Actualizar una plantilla
const update = async (id, dto) => {
    const { nombre, descripcion, ruta_archivo } = dto;

    if (!id || !nombre || !descripcion || !ruta_archivo) {
        throw new Error("Todos los campos son requeridos.");
    }

    const query = `
        UPDATE Plantilla
        SET nombre = ?, descripcion = ?, ruta_archivo = ?
        WHERE id = ?
    `;
    const values = [nombre, descripcion, ruta_archivo, id];

    try {
        const [result] = await pool.query(query, values);
        if (result.affectedRows === 0) {
            throw new Error("No se encontró la plantilla para actualizar.");
        }
        return { id, ...dto }; // Devuelve la plantilla actualizada
    } catch (error) {
        console.error("Error al actualizar plantilla:", error);
        throw new Error("Error al actualizar plantilla");
    }
};

// Eliminar una plantilla
const remove = async (id) => {
    if (!id) {
        throw new Error("El ID de la plantilla es obligatorio.");
    }

    const query = "DELETE FROM Plantilla WHERE id = ?";
    const values = [id];

    try {
        const [result] = await pool.query(query, values);
        if (result.affectedRows === 0) {
            throw new Error("No se encontró la plantilla para eliminar.");
        }
    } catch (error) {
        console.error("Error al eliminar plantilla:", error);
        throw new Error("Error al eliminar plantilla");
    }
};

export const catalogoPlantillasRepo = {
    create,
    findAll,
    update,
    remove,
};

import { pool } from "../db/pool.js";

// Crear una nueva unidad organizacional
const create = async (dto) => {
    const { nombre, descripcion } = dto;

    // Validación de los campos
    if (!nombre || !descripcion) {
        throw new Error('El nombre y la descripción son obligatorios');
    }

    const query = `
    INSERT INTO Unidad_Organizacional (nombre, descripcion)
    VALUES (?, ?)
  `;
    const values = [nombre, descripcion];

    try {
        const [result] = await pool.query(query, values);
        return { id: result.insertId, ...dto }; // Devolver el objeto creado con el ID asignado
    } catch (err) {
        console.error('Error al crear la unidad organizacional:', err);
        throw new Error('Error al crear la unidad organizacional');
    }
};

// Obtener todas las unidades organizacionales
const findAll = async () => {
    const query = "SELECT * FROM Unidad_Organizacional";
    try {
        const [rows] = await pool.query(query);
        return rows;
    } catch (err) {
        console.error('Error al obtener las unidades organizacionales:', err);
        throw new Error('Error al obtener las unidades organizacionales');
    }
};

// Actualizar una unidad organizacional
const update = async (id, dto) => {
    const { nombre, descripcion } = dto;

    // Validación de los campos
    if (!id || !nombre || !descripcion) {
        throw new Error('ID, nombre y descripción son obligatorios para actualizar');
    }

    const query = `
    UPDATE Unidad_Organizacional
    SET nombre = ?, descripcion = ?
    WHERE id = ?
  `;
    const values = [nombre, descripcion, id];

    try {
        const [result] = await pool.query(query, values);
        return result.affectedRows > 0 ? { id, ...dto } : null;
    } catch (err) {
        console.error('Error al actualizar la unidad organizacional:', err);
        throw new Error('Error al actualizar la unidad organizacional');
    }
};

// Eliminar una unidad organizacional
const remove = async (id) => {
    // Validación del ID
    if (!id) {
        throw new Error('ID de unidad organizacional es obligatorio para eliminar');
    }

    const query = "DELETE FROM Unidad_Organizacional WHERE id = ?";
    const values = [id];

    try {
        const [result] = await pool.query(query, values);
        if (result.affectedRows === 0) {
            throw new Error('No se encontró la unidad organizacional para eliminar');
        }
    } catch (err) {
        console.error('Error al eliminar la unidad organizacional:', err);
        throw new Error('Error al eliminar la unidad organizacional');
    }
};

export const catalogoUniOrganizacionalRepo = {
    create,
    findAll,
    update,
    remove,
};

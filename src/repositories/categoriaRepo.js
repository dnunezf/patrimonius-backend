import { pool } from "../db/pool.js";

/** Categoria repository. SQL-only. */
export const categoriaRepo = {
    // Crear una nueva categoría
    async createCategoria(categoriaData) {
        const { nombre, descripcion } = categoriaData;
        const query = `
      INSERT INTO Categoria (nombre, descripcion)
      VALUES (?, ?)
    `;
        const values = [nombre, descripcion];

        const [result] = await pool.query(query, values);
        return { id: result.insertId, ...categoriaData }; // Devolver el objeto creado con el ID asignado
    },

    // Al retornar las categorías, normaliza el nombre.
    async getAllCategorias() {
        const query = "SELECT * FROM Categoria";
        const [rows] = await pool.query(query);
        return rows.map(categoria => ({
            ...categoria,
            nombre: categoria.nombre.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) // Normalization
        }));
    },


    // Obtener una categoría por ID
    async getCategoriaById(id) {
        const query = `
      SELECT id, nombre, descripcion
      FROM Categoria
      WHERE id = ?
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] || null;
    },

    // Eliminar una categoría por ID
    async removeCategoria(id) {
        const query = `DELETE FROM Categoria WHERE id = ?`;
        await pool.query(query, [id]);
    },

    // Actualizar una categoría
    async updateCategoria(id, updateData) {
        const { nombre, descripcion } = updateData;
        const query = `
      UPDATE Categoria
      SET nombre = ?, descripcion = ?
      WHERE id = ?
    `;
        const values = [nombre, descripcion, id];

        const [result] = await pool.query(query, values);
        return result.affectedRows > 0 ? { id, ...updateData } : null; // Devuelve la categoría actualizada
    },
};
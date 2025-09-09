// src/repositories/permRepo.js
import { pool } from "../db/pool.js";

// Asignar permisos a un usuario
const setForUser = async (userId, permissions) => {
    const query = "DELETE FROM Permiso_Usuario WHERE usuario_id = ?";
    await pool.query(query, [userId]); // Elimina permisos anteriores

    const values = permissions.map(permission => [userId, permission]);
    const insertQuery = "INSERT INTO Permiso_Usuario (usuario_id, permiso) VALUES ?";

    await pool.query(insertQuery, [values]);
};

// Obtener permisos de un usuario
const getForUser = async (userId) => {
    const query = "SELECT permiso FROM Permiso_Usuario WHERE usuario_id = ?";
    const [rows] = await pool.query(query, [userId]);
    return rows.map(row => row.permiso);
};

export const permRepo = {
    setForUser,
    getForUser,
};

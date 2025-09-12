// src/services/rolService.js
import { pool } from '../db/pool.js';

/** Service to fetch the roles */
export const rolService = {
    async getAllRoles() {
        try {
            const [rows] = await pool.query('SELECT nombre FROM Rol');
            return rows.map(row => row.nombre);
        } catch (error) {
            console.error(error);
            throw new Error('Error fetching roles from the database');
        }
    },
};

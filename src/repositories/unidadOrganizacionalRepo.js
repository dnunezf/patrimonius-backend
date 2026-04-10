// src/repositories/unidadOrganizacionalRepo.js
import { pool } from "../db/pool.js";

export const unidadOrganizacionalRepo = {
    async getAll() {
        const [rows] = await pool.query(`
      SELECT id, nombre, descripcion
      FROM Unidad_Organizacional
      ORDER BY nombre ASC
    `);
        return rows;
    },
};
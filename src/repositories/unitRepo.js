import { pool } from "../db/pool.js";

export const unitRepo = {
  async findAll() {
    const [rows] = await pool.query(
      `SELECT id, nombre AS name, descripcion AS description
       FROM Unidad_Organizacional ORDER BY nombre`
    );
    return rows;
  },
};

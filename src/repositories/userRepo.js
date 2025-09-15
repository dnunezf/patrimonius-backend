import { pool } from "../db/pool.js";

/** User repository. SQL-only. */
export const userRepo = {
  async create(u) {
    try {
      const [r] = await pool.execute(
        `INSERT INTO Usuario (nombre,apellido1,apellido2,email,rol_id,unidad_id,password)
       VALUES (:nombre,:apellido1,:apellido2,:email,:rolId,:unidadId,'changeme')`,
        u
      );
      return { id: r.insertId, ...u };
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        // swallow duplicate silently or return a clean error
        throw Object.assign(new Error("email_already_exists"), { code: 409 });
      }
      throw e;
    }
  },

  async findAll() {
    const [rows] = await pool.query(
      `SELECT u.id,u.nombre,u.apellido1,u.apellido2,u.email,
              r.nombre AS rol, u.rol_id AS rolId,
              un.nombre AS unidad, u.unidad_id AS unidadId
       FROM Usuario u
       JOIN Rol r ON r.id=u.rol_id
       JOIN Unidad_Organizacional un ON un.id=u.unidad_id
       ORDER BY u.id DESC`
    );
    return rows;
  },
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT u.id,u.nombre,u.apellido1,u.apellido2,u.email,
            u.rol_id AS rolId, u.unidad_id AS unidadId
     FROM Usuario u
     WHERE u.id=:id`,
      { id }
    );
    return rows[0] || null;
  },
  async update(id, patch) {
    const fields = [];
    const params = { id };
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k}=:${k}`);
      params[k] = v;
    }
    if (!fields.length) return this.findById(id);
    await pool.execute(
      `UPDATE Usuario SET ${fields.join(", ")} WHERE id=:id`,
      params
    );
    return this.findById(id);
  },
  /** Search users by name or email */
  async search(searchTerm) {
    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.apellido1, u.apellido2, u.email
       FROM Usuario u
       WHERE u.nombre LIKE :search OR u.email LIKE :search
       ORDER BY u.id DESC`,
      { search: `%${searchTerm}%` } // Using LIKE to match partial searches
    );
    return rows; // Return the filtered rows
  },
  async remove(id) {
    await pool.execute(`DELETE FROM Usuario WHERE id=:id`, { id });
  },
};

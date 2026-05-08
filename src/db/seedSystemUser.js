// src/db/seedSystemUser.js
import { pool } from "../db/pool.js";

export async function seedSystemUser() {
  const email = "system@patrimonius.local";

  const [rows] = await pool.query(
    "SELECT id FROM Usuario WHERE email = ? LIMIT 1",
    [email],
  );

  if (rows.length) {
    console.log("✅ SYSTEM user ya existe (id =", rows[0].id + ")");
    return rows[0].id;
  }

  const [res] = await pool.query(
    `INSERT INTO Usuario
      (nombre, apellido1, apellido2, email, password, mustChangePassword, rol_id, unidad_id, last2FACode, last2FAExpiry)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      "SYSTEM",
      "SYSTEM",
      "SYSTEM",
      email,
      "__system__", // valor no nulo
      0,
      1,
      1,
    ],
  );

  console.log("✅ SYSTEM user creado (id =", res.insertId + ")");
  return res.insertId;
}

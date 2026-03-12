//src/db/seedSystemUser.js
import { pool } from "../db/pool.js";

export async function seedSystemUser() {
    const email = "system@patrimonius.local";

    // 1) ya existe?
    const [rows] = await pool.query(
        "SELECT id FROM Usuario WHERE email = ? LIMIT 1",
        [email]
    );

    if (rows.length) {
        console.log("✅ SYSTEM user ya existe (id =", rows[0].id + ")");
        return rows[0].id;
    }

    // 2) crear (valores por defecto seguros)
    const [res] = await pool.query(
        `INSERT INTO Usuario
      (nombre, apellido1, apellido2, email, password, mustChangePassword, rol_id, unidad_id, last2FACode, last2FAExpiry)
     VALUES
      (?,      ?,         ?,         ?,     ?,        ?,                ?,      ?,        NULL,      NULL)`,
        [
            "SYSTEM",
            "SYSTEM",
            "SYSTEM",
            email,

            , // no se usa para login, solo para cumplir NOT NULL
            0,            // o 1 si tu sistema lo requiere como pendiente de cambio
            1,            // rol admin por defecto
            1,            // unidad por defecto
        ]
    );

    console.log("✅ SYSTEM user creado (id =", res.insertId + ")");
    return res.insertId;
}

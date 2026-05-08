// src/db/pool.js
import mysql from "mysql2/promise";
import "dotenv/config";

export const pool = mysql.createPool({
host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    ssl: {
  minVersion: "TLSv1.2",
      rejectUnauthorized: false,
},
});
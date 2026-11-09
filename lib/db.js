import mysql from "mysql2/promise";

// Reuse one pool across hot reloads / requests
const globalForDb = globalThis;

export const pool =
  globalForDb.__dbPool ??
  (globalForDb.__dbPool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  }));

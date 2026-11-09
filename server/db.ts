import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { config } from "./config";

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
  dateStrings: ["DATE"], // DATE columns stay plain YYYY-MM-DD strings (no timezone shifts)
  timezone: "Z", // timestamps are stored and exchanged as UTC
});

export const db = drizzle(pool, { schema, mode: "default" });

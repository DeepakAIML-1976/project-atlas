import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

const isSupabaseOrCloud =
  connectionString.includes("supabase") ||
  connectionString.includes("sslmode=require") ||
  connectionString.includes("pooler.supabase.com");

export const pool = new Pool({
  connectionString,
  ...(isSupabaseOrCloud ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";

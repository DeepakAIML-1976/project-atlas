import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function parseConnectionStringToPgConfig(rawUrl: string): pg.PoolConfig {
  const cleaned = rawUrl.trim().replace(/^["']|["']$/g, "");
  const isSupabaseOrCloud =
    cleaned.includes("supabase") ||
    cleaned.includes("sslmode=require") ||
    cleaned.includes("pooler.supabase.com");

  // Try standard URL parser first
  try {
    const parsed = new URL(cleaned);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname ? parsed.pathname.replace(/^\//, "") : "postgres",
      ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
    };
  } catch {
    // Regex parser for connection strings with unencoded special characters in password or username
    const match = cleaned.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^:\/]+)(?::(\d+))?\/(.+)$/);
    if (match) {
      const [, , user, pass, host, portStr, dbName] = match;
      const cleanDbName = dbName.split("?")[0];

      return {
        host: host,
        port: portStr ? parseInt(portStr, 10) : 5432,
        user: decodeURIComponent(user),
        password: decodeURIComponent(pass),
        database: cleanDbName,
        ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
      };
    }

    return {
      connectionString: cleaned,
      ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
    };
  }
}

const rawDbUrl = process.env.DATABASE_URL || "";
if (!rawDbUrl.trim()) {
  throw new Error(
    "DATABASE_URL must be set in your .env file. Example: DATABASE_URL=postgresql://postgres:password@localhost:5432/digital_twin_suite",
  );
}

const pgConfig = parseConnectionStringToPgConfig(rawDbUrl);

export const pool = new Pool(pgConfig);
export const db = drizzle(pool, { schema });

export * from "./schema";

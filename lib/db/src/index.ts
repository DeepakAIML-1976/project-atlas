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

  // First try regex parsing to handle unencoded special characters in password like '#', '?', '@', etc.
  const match = cleaned.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^:\/\?]+)(?::(\d+))?\/(.+)$/);
  if (match) {
    const [, , user, pass, host, portStr, dbAndParams] = match;
    const dbName = dbAndParams.split("?")[0];
    return {
      host: host,
      port: portStr ? parseInt(portStr, 10) : 5432,
      user: decodeURIComponent(user),
      password: decodeURIComponent(pass),
      database: dbName,
      ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
    };
  }

  // Fallback to standard URL parsing if hostname is valid
  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname) {
      return {
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 5432,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname ? parsed.pathname.replace(/^\//, "") : "postgres",
        ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
      };
    }
  } catch {
    // Ignore and fallback
  }

  return {
    connectionString: cleaned,
    ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
  };
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

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function parseConnectionStringToPgConfig(rawUrl: string): pg.PoolConfig {
  const cleaned = rawUrl.trim().replace(/^["']|["']$/g, "");

  const isLocal =
    cleaned.includes("localhost") ||
    cleaned.includes("127.0.0.1") ||
    cleaned.includes("@postgres:") ||
    cleaned.includes("@host.docker.internal");
  const isCloud = !isLocal;
  const sslConfig = isCloud ? { rejectUnauthorized: false } : undefined;

  let host = "";
  let port = 5432;
  let user = "";
  let password = "";
  let database = "postgres";

  // First try regex parsing to handle unencoded special characters in password like '#', '?', '@', etc.
  const match = cleaned.match(/^(?:postgres(?:ql)?:\/\/)([^:]+):(.*)@([^:\/\?]+)(?::(\d+))?(?:\/(.*))?$/);
  if (match) {
    const [, u, p, h, portStr, dbAndParams] = match;
    try {
      user = decodeURIComponent(u);
    } catch {
      user = u;
    }
    try {
      password = decodeURIComponent(p);
    } catch {
      password = p;
    }
    host = h;
    port = portStr ? parseInt(portStr, 10) : 5432;
    database = (dbAndParams || "postgres").split("?")[0] || "postgres";
  } else {
    try {
      const parsed = new URL(cleaned);
      if (parsed.hostname) {
        host = parsed.hostname;
        port = parsed.port ? parseInt(parsed.port, 10) : 5432;
        try {
          user = decodeURIComponent(parsed.username);
        } catch {
          user = parsed.username;
        }
        try {
          password = decodeURIComponent(parsed.password);
        } catch {
          password = parsed.password;
        }
        database = parsed.pathname ? parsed.pathname.replace(/^\//, "") : "postgres";
      }
    } catch {}
  }

  if (host) {
    // Check if host is a Supabase direct host (db.<project-ref>.supabase.co)
    // Supabase direct host only has IPv6 AAAA records.
    // Cloud environments (Render, AWS VPC IPv4) cannot connect via IPv6.
    // Automatically rewrite to the dual-stack IPv4 Supabase pooler host and format user with tenant ref.
    const directMatch = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (directMatch) {
      const projectRef = directMatch[1];
      host = "aws-0-ap-northeast-1.pooler.supabase.com";
      port = 6543;
      if (!user.includes(".")) {
        user = `${user}.${projectRef}`;
      }
    } else if (host.includes("pooler.supabase.com")) {
      // If host is already pooler, ensure user includes the project ref
      if (!user.includes(".")) {
        user = `${user}.fiqjwkaoowcfqbenqnxa`;
      }
    }

    return {
      host,
      port,
      user,
      password,
      database,
      ssl: sslConfig,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 60000,
      max: 10,
    };
  }

  return {
    connectionString: cleaned,
    ssl: sslConfig,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 60000,
    max: 10,
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
pool.on("error", (err) => {
  console.warn("PostgreSQL Pool background client warning:", err?.message || err);
});
export const db = drizzle(pool, { schema });

export * from "./schema";

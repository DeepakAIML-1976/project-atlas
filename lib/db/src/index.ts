import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function parseConnectionStringToPgConfig(rawUrl: string): pg.PoolConfig {
  let cleaned = rawUrl.trim().replace(/^["']|["']$/g, "");

  // Supabase direct host (db.<project-ref>.supabase.co) only resolves to IPv6.
  // Render and other cloud platforms do not support outbound IPv6 on free/shared tiers.
  // Automatically rewrite to the dual-stack IPv4 Supabase pooler host for this project.
  const supabaseDirectMatch = cleaned.match(/db\.([a-z0-9]+)\.supabase\.co/);
  if (supabaseDirectMatch) {
    const projectRef = supabaseDirectMatch[1];
    cleaned = cleaned
      .replace(new RegExp(`db\\.${projectRef}\\.supabase\\.co(:\\d+)?`), "aws-0-ap-northeast-1.pooler.supabase.com:6543");
    if (!cleaned.includes(`postgres.${projectRef}:`)) {
      cleaned = cleaned.replace("postgres:", `postgres.${projectRef}:`);
    }
  }

  const isLocal =
    cleaned.includes("localhost") ||
    cleaned.includes("127.0.0.1") ||
    cleaned.includes("@postgres:") ||
    cleaned.includes("@host.docker.internal");
  const isCloud = !isLocal;
  const sslConfig = isCloud ? { rejectUnauthorized: false } : undefined;

  // First try regex parsing to handle unencoded special characters in password like '#', '?', '@', etc.
  const match = cleaned.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^:\/\?]+)(?::(\d+))?\/(.+)$/);
  if (match) {
    let [, , user, pass, host, portStr, dbAndParams] = match;
    const dbName = dbAndParams.split("?")[0];

    // Extra safeguard: if host is still db.<ref>.supabase.co
    const directMatch = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (directMatch) {
      host = "aws-0-ap-northeast-1.pooler.supabase.com";
      portStr = "6543";
      if (!user.includes(".")) user = `postgres.${directMatch[1]}`;
    }

    return {
      host: host,
      port: portStr ? parseInt(portStr, 10) : 5432,
      user: decodeURIComponent(user),
      password: decodeURIComponent(pass),
      database: dbName,
      ssl: sslConfig,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10,
    };
  }

  // Fallback to standard URL parsing if hostname is valid
  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname) {
      let host = parsed.hostname;
      let port = parsed.port ? parseInt(parsed.port, 10) : 5432;
      let user = decodeURIComponent(parsed.username);
      const directMatch = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
      if (directMatch) {
        host = "aws-0-ap-northeast-1.pooler.supabase.com";
        port = 6543;
        if (!user.includes(".")) user = `postgres.${directMatch[1]}`;
      }
      return {
        host,
        port,
        user,
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname ? parsed.pathname.replace(/^\//, "") : "postgres",
        ssl: sslConfig,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10,
      };
    }
  } catch {
    // Ignore and fallback
  }

  return {
    connectionString: cleaned,
    ssl: sslConfig,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
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

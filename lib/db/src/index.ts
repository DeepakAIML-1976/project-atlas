import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function safeParseConnectionString(rawUrl: string): string {
  let cleaned = rawUrl.trim().replace(/^["']|["']$/g, "");
  try {
    new URL(cleaned);
    return cleaned;
  } catch {
    // Attempt auto-encoding of password if user:pass@host format has unencoded @ or special chars in password
    const lastAtIndex = cleaned.lastIndexOf("@");
    if (lastAtIndex > 0) {
      const schemeEnd = cleaned.indexOf("://");
      if (schemeEnd > 0) {
        const proto = cleaned.substring(0, schemeEnd + 3);
        const rest = cleaned.substring(schemeEnd + 3);
        const lastAtInRest = rest.lastIndexOf("@");
        if (lastAtInRest > 0) {
          const userInfo = rest.substring(0, lastAtInRest);
          const hostAndPath = rest.substring(lastAtInRest + 1);
          const firstColon = userInfo.indexOf(":");
          if (firstColon > 0) {
            const user = userInfo.substring(0, firstColon);
            const pass = userInfo.substring(firstColon + 1);
            const encodedPass = encodeURIComponent(pass);
            const reassembled = `${proto}${user}:${encodedPass}@${hostAndPath}`;
            try {
              new URL(reassembled);
              return reassembled;
            } catch {
              // Fall through
            }
          }
        }
      }
    }
    return cleaned;
  }
}

const rawDbUrl = process.env.DATABASE_URL || "";
if (!rawDbUrl.trim()) {
  throw new Error(
    "DATABASE_URL must be set in your .env file. Example: DATABASE_URL=postgresql://postgres:password@localhost:5432/digital_twin_suite",
  );
}

const connectionString = safeParseConnectionString(rawDbUrl);

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

import { createRequire } from "module";
const require = createRequire("C:/Users/dpeng/Documents/Digital-Twin-Suite/lib/db/package.json");
const { Pool } = require("pg");

const pool = new Pool({
  host: "aws-0-ap-northeast-1.pooler.supabase.com",
  port: 6543,
  user: "postgres.fiqjwkaoowcfqbenqnxa",
  password: "Ripeace1976#",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  console.log("Adding active_session_token columns to atlas_users...");
  await client.query(`
    ALTER TABLE atlas_users 
    ADD COLUMN IF NOT EXISTS active_session_token text,
    ADD COLUMN IF NOT EXISTS last_session_ip text,
    ADD COLUMN IF NOT EXISTS last_session_user_agent text;
  `);
  console.log("Migration successful!");
  client.release();
  await pool.end();
}

run().catch(console.error);

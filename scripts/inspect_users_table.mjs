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
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_users';
  `);
  console.log("atlas_users columns:", res.rows);
  client.release();
  await pool.end();
}

run().catch(console.error);

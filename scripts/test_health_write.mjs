import { execSync } from "node:child_process";
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
  const out = execSync("tasklist /FO CSV /NH", { encoding: "utf8" }).toLowerCase();
  const ol = out.includes("outlook.exe");
  const tm = out.includes("ms-teams.exe") || out.includes("teams.exe");
  const zm = out.includes("zoom.exe");
  console.log("Local Process Check:", { outlook: ol, teams: tm, zoom: zm });

  const client = await pool.connect();
  const before = await client.query("SELECT * FROM atlas_app_health LIMIT 5");
  console.log("DB before update:", before.rows);

  await client.query(`
    INSERT INTO atlas_app_health (id, workspace_id, device_name, outlook_running, teams_running, zoom_running, account_email, last_heartbeat)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (id) DO UPDATE SET
      outlook_running = EXCLUDED.outlook_running,
      teams_running = EXCLUDED.teams_running,
      zoom_running = EXCLUDED.zoom_running,
      last_heartbeat = NOW()
  `, ['health_1a39970a-abf0-48c3-8b89-08b669e80bbe', '1a39970a-abf0-48c3-8b89-08b669e80bbe', 'Windows Workstation', ol, tm, zm, 'deepak.paranjape@kentplc.com']);

  const after = await client.query("SELECT * FROM atlas_app_health LIMIT 5");
  console.log("DB after update:", after.rows);

  client.release();
  await pool.end();
}

run().catch(console.error);

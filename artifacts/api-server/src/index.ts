import app from "./app";
import { logger } from "./lib/logger";
import { ensurePCOSTablesExist } from "./lib/createTables";

const rawPort = process.env["PORT"] || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  await ensurePCOSTablesExist();

  try {
    const { startTeamsSyncDaemon } = await import("./lib/integrations/teamsSyncService.js");
    startTeamsSyncDaemon(5000);
  } catch (syncErr: any) {
    logger.warn({ err: syncErr?.message }, "Teams universal sync daemon startup notice");
  }

  if (process.env.AUTO_START_LIVE_RESPONDER === "true") {
    try {
      const { spawn } = await import("child_process");
      const path = await import("path");
      const fs = await import("fs");
      const candidatePaths = [
        path.resolve(process.cwd(), "scratch/live_teams_and_mail_auto_responder.mjs"),
        path.resolve(process.cwd(), "../../scratch/live_teams_and_mail_auto_responder.mjs"),
      ];
      const scriptPath = candidatePaths.find((p) => fs.existsSync(p));
      if (scriptPath) {
        const responder = spawn(process.execPath, [scriptPath], {
          stdio: "inherit",
          env: { ...process.env, PORT: String(port) },
        });
        responder.on("error", (err) => logger.warn({ err }, "Auto-responder process error"));
        logger.info({ scriptPath }, "Auto-started Live Teams & Mail responder daemon in background");
      }
    } catch (e: any) {
      logger.warn({ err: e?.message }, "Failed to auto-start live responder daemon");
    }
  }
});

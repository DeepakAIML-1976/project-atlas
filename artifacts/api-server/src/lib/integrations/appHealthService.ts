import { execSync } from "node:child_process";
import { db } from "@workspace/db";
import { atlasAppHealthTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";

export interface AppHealthDetail {
  name: string;
  process: string;
  running: boolean;
  purpose: string;
  account?: string;
  warning: string | null;
}

export interface ClientHealthReport {
  isDesktop: boolean;
  platform: string;
  lastCheckedAt: string;
  allReady: boolean;
  requiresWarning: boolean;
  ingestionBlocked: boolean;
  apps: {
    outlook: AppHealthDetail;
    teams: AppHealthDetail;
    zoom: AppHealthDetail;
  };
  warnings: string[];
  bannerMessage: string;
}

export function checkLocalDesktopProcesses(): { outlookRunning: boolean; teamsRunning: boolean; zoomRunning: boolean } {
  if (process.platform !== "win32") {
    return { outlookRunning: false, teamsRunning: false, zoomRunning: false };
  }
  try {
    const out = execSync("tasklist /FO CSV /NH", { encoding: "utf8", windowsHide: true }).toLowerCase();
    const outlookRunning = out.includes("outlook.exe");
    const teamsRunning = out.includes("teams.exe") || out.includes("ms-teams.exe");
    const zoomRunning = out.includes("zoom.exe");
    return { outlookRunning, teamsRunning, zoomRunning };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to execute tasklist for app health check");
    return { outlookRunning: false, teamsRunning: false, zoomRunning: false };
  }
}

export async function getClientAppHealth(workspaceId: string): Promise<ClientHealthReport> {
  const isWindows = process.platform === "win32";
  let outlookRunning = false;
  let teamsRunning = false;
  let zoomRunning = false;
  let lastChecked = new Date();

  if (isWindows) {
    const local = checkLocalDesktopProcesses();
    outlookRunning = local.outlookRunning;
    teamsRunning = local.teamsRunning;
    zoomRunning = local.zoomRunning;

    // Record heartbeat into Supabase
    try {
      const healthId = `health_${workspaceId}`;
      const [existing] = await db
        .select()
        .from(atlasAppHealthTable)
        .where(eq(atlasAppHealthTable.workspaceId, workspaceId))
        .limit(1);

      if (existing) {
        await db
          .update(atlasAppHealthTable)
          .set({
            outlookRunning,
            teamsRunning,
            zoomRunning,
            lastHeartbeat: new Date(),
          })
          .where(eq(atlasAppHealthTable.id, existing.id));
      } else {
        await db.insert(atlasAppHealthTable).values({
          id: healthId,
          workspaceId,
          deviceName: process.env.COMPUTERNAME || "Windows Workstation",
          outlookRunning,
          teamsRunning,
          zoomRunning,
          accountEmail: "deepak.paranjape@kentplc.com",
          lastHeartbeat: new Date(),
        });
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Could not record workstation app health in DB");
    }
  } else {
    // Cloud / Render environment: read latest workstation heartbeat from Supabase
    try {
      const [record] = await db
        .select()
        .from(atlasAppHealthTable)
        .where(eq(atlasAppHealthTable.workspaceId, workspaceId))
        .limit(1);

      if (record) {
        lastChecked = record.lastHeartbeat ? new Date(record.lastHeartbeat) : new Date();
        const ageMinutes = (Date.now() - lastChecked.getTime()) / (1000 * 60);

        // If reported within 60 minutes, use the status
        if (ageMinutes < 60) {
          outlookRunning = record.outlookRunning;
          teamsRunning = record.teamsRunning;
          zoomRunning = record.zoomRunning;
        } else {
          // Stale heartbeat - workstation is offline/sleep
          outlookRunning = false;
          teamsRunning = false;
          zoomRunning = false;
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Failed to read app health from DB on cloud");
    }
  }

  const warnings: string[] = [];
  if (!outlookRunning) {
    warnings.push("Microsoft Outlook is closed. No email or calendar ingestion will take place until Outlook is opened.");
  }
  if (!teamsRunning) {
    warnings.push("Microsoft Teams is closed. Live Teams bot meeting attendance and acoustic triggers are inactive.");
  }
  if (!zoomRunning) {
    warnings.push("Zoom Workplace is closed. Live Zoom meeting bot attendance is inactive.");
  }

  const allReady = outlookRunning && teamsRunning && zoomRunning;
  const requiresWarning = !outlookRunning || !teamsRunning || !zoomRunning;
  const ingestionBlocked = !outlookRunning;

  let bannerMessage = "All required applications (Outlook, Teams, Zoom) are open and operational.";
  if (ingestionBlocked) {
    bannerMessage = "CRITICAL: Microsoft Outlook is not open or working. No email or calendar ingestion will take place.";
  } else if (requiresWarning) {
    bannerMessage = `Warning: ${warnings.join(" ")}`;
  }

  return {
    isDesktop: isWindows,
    platform: process.platform,
    lastCheckedAt: lastChecked.toISOString(),
    allReady,
    requiresWarning,
    ingestionBlocked,
    apps: {
      outlook: {
        name: "Microsoft Outlook",
        process: "OUTLOOK.EXE",
        running: outlookRunning,
        purpose: "Daily Email Ingestion & 14-Day Calendar Ingestion",
        account: "deepak.paranjape@kentplc.com",
        warning: !outlookRunning ? "No email or calendar ingestion will take place while closed." : null,
      },
      teams: {
        name: "Microsoft Teams",
        process: "Teams.exe / ms-teams.exe",
        running: teamsRunning,
        purpose: "Live Bot Meeting Attendance & Real-Time Acoustic Triggers",
        warning: !teamsRunning ? "Live Teams bot meeting attendance inactive." : null,
      },
      zoom: {
        name: "Zoom Workplace",
        process: "Zoom.exe",
        running: zoomRunning,
        purpose: "Live Zoom Meeting Bot Attendance",
        warning: !zoomRunning ? "Live Zoom meeting bot attendance inactive." : null,
      },
    },
    warnings,
    bannerMessage,
  };
}

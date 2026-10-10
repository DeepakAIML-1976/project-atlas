import { db, atlasLiveMeetingsTable, atlasActionsTable, atlasMeetingsTable } from "@workspace/db";
import { logger } from "../logger";
import { processLiveTranscriptChunk } from "../atlasMeetingBot";
import { spawn } from "node:child_process";
import path from "node:path";

export interface TeamsBrowserBotConfig {
  workspaceId: string;
  meetingUrl: string;
  botDisplayName?: string;
  autoQnA?: boolean;
  trackAttendance?: boolean;
  extractActions?: boolean;
}

export interface AttendanceRecord {
  name: string;
  joinedAt: Date;
  leftAt?: Date;
  status: "active" | "left";
}

/**
 * Microsoft Teams Web Browser Live Meeting Listener Suite
 * 
 * Capabilities:
 * 1. Attendance & Roster Tracking: Log participant entry/exit times.
 * 2. Live Transcription & Summarization: Capture captions and generate meeting notes.
 * 3. AI Representative Q&A: Respond to technical questions using Deepak's Digital Twin context.
 * 4. Action Item & Task Extraction: Auto-create dashboard tasks from meeting discussions.
 */
export async function deployTeamsWebBrowserBot(config: TeamsBrowserBotConfig) {
  const botDisplayName = config.botDisplayName || "Deepak AI Representative Atlas";

  try {
    // 1. Create live meeting session record in database
    const [meeting] = await db
      .insert(atlasLiveMeetingsTable)
      .values({
        workspaceId: config.workspaceId,
        meetingTitle: "Live Microsoft Teams Call",
        platform: "teams",
        meetingUrl: config.meetingUrl,
        botStatus: "in_call",
        botDisplayName,
        joinedAt: new Date(),
      })
      .returning();

    logger.info({ meetingId: meeting.id, url: config.meetingUrl }, "Deploying Teams Web Browser Bot Automation Suite");

    // 2. Launch background Playwright automation worker script
    const scriptPath = path.resolve(process.cwd(), "scratch/join_live_teams_meeting.js");
    
    // Spawn detached process for continuous meeting listening
    const child = spawn("node", [scriptPath], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        TARGET_MEETING_URL: config.meetingUrl,
        BOT_DISPLAY_NAME: botDisplayName,
        WORKSPACE_ID: config.workspaceId,
        LIVE_MEETING_ID: meeting.id,
      },
    });
    child.unref();

    return {
      success: true,
      meetingId: meeting.id,
      botDisplayName,
      status: "in_call",
      featuresEnabled: {
        attendanceTracking: config.trackAttendance ?? true,
        liveTranscription: true,
        aiRepresentativeQnA: config.autoQnA ?? true,
        actionItemExtraction: config.extractActions ?? true,
      },
      message: `Successfully deployed ${botDisplayName} to live Teams meeting!`,
      instructions: "The bot will log participants, record live transcripts, extract action items, and respond to queries addressed to Deepak.",
    };
  } catch (err: any) {
    logger.error({ err }, "Failed to deploy Teams Web Browser Bot");
    return {
      success: false,
      error: err?.message || "Failed to launch Teams Web Meeting Listener",
    };
  }
}

/**
 * Handle incoming live meeting transcript chunk from web scraper worker
 */
export async function handleLiveMeetingChunk(
  workspaceId: string,
  liveMeetingId: string,
  speakerName: string,
  text: string
) {
  logger.info({ workspaceId, liveMeetingId, speakerName, text: text.slice(0, 50) }, "Processing live meeting transcript chunk");
  return await processLiveTranscriptChunk(workspaceId, liveMeetingId, speakerName, text);
}


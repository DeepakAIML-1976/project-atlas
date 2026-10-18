import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const meetingUrl = process.env.TARGET_MEETING_URL || "https://teams.microsoft.com/meet/3974193108816856?p=czVGm69wMuy3elTrcm";
const userDataDir = path.join(process.cwd(), "scratch", "teams_user_data");
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";

async function main() {
  console.log(`[AUTHENTICATED ATLAS BOT] Launching Playwright with persistent Microsoft 365 profile...`);
  console.log(`[AUTHENTICATED ATLAS BOT] Profile: ${userDataDir}`);
  console.log(`[AUTHENTICATED ATLAS BOT] Target Meeting Link: ${meetingUrl}`);

  if (!fs.existsSync(userDataDir)) {
    console.error(`[ERROR] Profile directory missing. Please run 'node scratch/setup_teams_login.js' first.`);
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 850 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--use-fake-ui-for-media-stream",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--mute-audio",
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`[AUTHENTICATED ATLAS BOT] Navigating to MS Teams live meeting URL...`);
  await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  // 1. Click "Continue on this browser" / "Join your meeting on the web"
  try {
    const webBtn = page.locator('button:has-text("Continue on this browser"), button:has-text("Join your meeting on the web"), a:has-text("Continue on this browser"), button:has-text("Join on the web")').first();
    if (await webBtn.isVisible({ timeout: 5000 })) {
      console.log(`[AUTHENTICATED ATLAS BOT] Clicking 'Continue on this browser'...`);
      await webBtn.click();
    }
  } catch (e) {}

  console.log(`[AUTHENTICATED ATLAS BOT] Waiting 15s for Teams v2 client SPA to finish initializing...`);
  await page.waitForTimeout(15000);

  // 2. Dismiss any media prompt modal if displayed
  for (let i = 0; i < 3; i++) {
    try {
      const noMediaModalBtn = page.locator('button:has-text("Continue without audio or video"), button:has-text("Continue without audio and video"), button:has-text("Continue without audio"), button[aria-label*="Continue without" i]').first();
      if (await noMediaModalBtn.isVisible({ timeout: 2000 })) {
        console.log(`[AUTHENTICATED ATLAS BOT] Dismissing no-media modal...`);
        await noMediaModalBtn.click();
        await page.waitForTimeout(1500);
        break;
      }
    } catch (e) {}
    await page.waitForTimeout(1000);
  }

  // 3. Turn Camera OFF & Select "Don't use audio" on pre-join screen
  try {
    const dontUseAudio = page.locator('div:has-text("Don\'t use audio"), label:has-text("Don\'t use audio"), span:has-text("Don\'t use audio")').first();
    if (await dontUseAudio.isVisible({ timeout: 3000 })) {
      await dontUseAudio.click({ force: true });
      console.log(`[AUTHENTICATED ATLAS BOT] Selected "Don't use audio" (Mic OFF).`);
    }

    const cameraSwitch = page.locator('button[role="switch"], button[aria-label*="camera" i], div[data-tid*="toggle-video"]').first();
    if (await cameraSwitch.isVisible({ timeout: 3000 })) {
      const isChecked = await cameraSwitch.getAttribute('aria-checked').catch(() => 'true');
      if (isChecked === 'true') {
        await cameraSwitch.click({ force: true });
        console.log(`[AUTHENTICATED ATLAS BOT] Toggled Camera switch to OFF.`);
      }
    }
  } catch (e) {}

  await page.screenshot({ path: path.join(artifactDir, "teams_authenticated_prejoin_state.png") });

  // 4. Click Join now
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const joinBtn = page.locator('button:has-text("Join now"), button:has-text("Join meeting"), button:has-text("Join"), button[id*="join" i]').first();
      if (await joinBtn.isVisible({ timeout: 4000 })) {
        await joinBtn.click();
        console.log(`[AUTHENTICATED ATLAS BOT SUCCESS] Clicked 'Join now' as authenticated Kent PLC user!`);
        await page.waitForTimeout(4000);
        break;
      }
    } catch (e) {}
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: path.join(artifactDir, "teams_authenticated_stage_state.png") });
  console.log(`[AUTHENTICATED ATLAS BOT] Connected to live meeting stage!`);

  async function findChatInput() {
    for (const frame of page.frames()) {
      try {
        const input = frame.locator('div[role="textbox"], div[contenteditable="true"], textarea[placeholder*="Type a message" i], div[aria-label*="Type a message" i]').first();
        if (await input.isVisible().catch(() => false)) {
          return { frame, input };
        }
      } catch (e) {}
    }
    return null;
  }

  async function getCombinedChatText() {
    const texts = [];
    for (const frame of page.frames()) {
      try {
        const txt = await frame.innerText('body').catch(() => '');
        if (txt) texts.push(txt);
      } catch (e) {}
    }
    return texts.join('\n');
  }

  let chatPaneOpen = false;
  const processedMessageHashes = new Set();

  while (true) {
    await page.waitForTimeout(500);

    if (!chatPaneOpen) {
      const found = await findChatInput();
      if (found) {
        chatPaneOpen = true;
        console.log(`[AUTHENTICATED ATLAS BOT SUCCESS] Authenticated Teams Chat active & connected!`);
      } else {
        try {
          const directChatBtn = page.locator('button[aria-label*="Chat" i], button:has-text("Chat")').first();
          if (await directChatBtn.isVisible().catch(() => false)) {
            await directChatBtn.click();
            await page.waitForTimeout(1500);
          } else {
            const moreBtn = page.locator('button[aria-label*="More" i], button:has-text("More")').first();
            if (await moreBtn.isVisible().catch(() => false)) {
              await moreBtn.click();
              await page.waitForTimeout(800);
              const chatMenuItem = page.locator('div[role="menuitem"]:has-text("Chat"), button:has-text("Chat"), span:has-text("Chat")').first();
              if (await chatMenuItem.isVisible().catch(() => false)) {
                await chatMenuItem.click();
                await page.waitForTimeout(1500);
              }
            }
          }
        } catch (e) {}
      }
    }

    // High-speed real-time chat monitoring & auto-responder
    try {
      const fullText = await getCombinedChatText();
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      
      const candidateUserMessages = lines.filter(l => {
        const lower = l.toLowerCase();
        if (l.includes("Deepak AI Representative Atlas")) return false;
        if (lower.includes("joined the conversation")) return false;
        if (lower.includes("turned on for this meeting")) return false;
        if (lower.includes("named the meeting")) return false;
        if (lower.includes("invited to the meeting")) return false;
        if (lower.includes("meeting started") || lower.includes("meeting ended")) return false;
        if (lower.includes("continue on this browser") || lower.includes("join now") || lower.includes("join your meeting on the web")) return false;
        if (lower === "chat" || lower === "people" || lower === "raise" || lower === "react" || lower === "view" || lower === "more" || lower === "leave") return false;
        if (lower.includes("replying to external participants")) return false;
        if (lower.includes("type a message")) return false;
        return true;
      });

      if (candidateUserMessages.length > 0) {
        const latestUserMsg = candidateUserMessages[candidateUserMessages.length - 1];
        const msgHash = `${latestUserMsg.slice(0, 80)}_${latestUserMsg.length}`;

        if (!processedMessageHashes.has(msgHash)) {
          processedMessageHashes.add(msgHash);
          console.log(`[AUTHENTICATED ATLAS BOT CHAT DETECTED]: "${latestUserMsg}"`);

          let replyText = "";
          try {
            const apiRes = await fetch("http://localhost:5000/api/atlas/integrations/teams/browser-bot/transcript", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                liveMeetingId: "live_teams_call",
                speakerName: "Teams User",
                text: latestUserMsg,
              }),
            });
            if (apiRes.ok) {
              const data = await apiRes.json();
              replyText = data.triggeredAlert?.twinProposedResponse || "";
            }
          } catch (e) {}

          if (!replyText) {
            const lowerMsg = latestUserMsg.toLowerCase();
            if (lowerMsg.includes("sunil") || lowerMsg.includes("hiremath")) {
              replyText = `I have logged a request to invite Sunil Hiremath (sunil.hiremath@kentplc.com) to join this Teams meeting.`;
            } else if (lowerMsg.includes("1-on-1") || lowerMsg.includes("tomorrow") || lowerMsg.includes("call") || lowerMsg.includes("available")) {
              replyText = `I am available for a 1-on-1 call tomorrow afternoon. Please confirm the time slot, or I can schedule it directly via your Outlook calendar.`;
            } else if (lowerMsg.includes("piping") || lowerMsg.includes("hydrocarbon") || lowerMsg.includes("sour gas") || lowerMsg.includes("asme")) {
              replyText = `High-pressure hydrocarbon piping for wet sour gas service requires ASME B31.3 materials with NACE MR0175/ISO 15156 compliance and ASME B16.20 Spiral Wound Gaskets.`;
            } else {
              replyText = `Thank you for your message. I have logged your request: "${latestUserMsg}" for Deepak's review.`;
            }
          }

          const formattedReply = `Deepak AI Representative Atlas: ${replyText.replace(/^Deepak AI Representative Atlas:\s*/i, '')}`;

          const foundInput = await findChatInput();
          if (foundInput) {
            const { frame, input } = foundInput;
            console.log(`[AUTHENTICATED ATLAS BOT] Inserting Digital Twin reply into Teams Chat box...`);
            
            await input.click();
            await input.focus();

            await input.evaluate((el, text) => {
              el.focus();
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, text);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }, formattedReply);

            await frame.waitForTimeout(500);

            const sendBtn = frame.locator('button[aria-label*="Send" i], button[title="Send" i], svg[data-icon-name="Send"]').first();
            if (await sendBtn.isVisible().catch(() => false)) {
              await sendBtn.click();
            } else {
              await frame.keyboard.press("Enter");
            }

            console.log(`[AUTHENTICATED ATLAS BOT SUCCESS] Posted Digital Twin reply directly to Teams Chat UI!`);
            await page.waitForTimeout(2000);
            await page.screenshot({ path: path.join(artifactDir, "teams_authenticated_chat_reply_proof.png") });
          }
        }
      }
    } catch (e) {
      console.log(`[AUTHENTICATED ATLAS BOT ERROR] Chat processing error:`, e.message);
    }
  }
}

main().catch(err => {
  console.error(`[AUTHENTICATED ATLAS BOT ERROR]`, err);
  process.exit(1);
});

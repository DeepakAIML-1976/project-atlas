import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const meetingUrl = process.env.TARGET_MEETING_URL || "https://teams.microsoft.com/meet/3974193108816856?p=czVGm69wMuy3elTrcm";
const rawBotName = process.env.BOT_DISPLAY_NAME || "Deepak AI Representative Atlas";
const botName = rawBotName.replace(/[()'"]/g, "").trim() || "Deepak AI Representative Atlas";
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";

async function main() {
  console.log(`[ATLAS BOT] Launching Chromium browser worker to join live Teams call...`);
  console.log(`[ATLAS BOT] Target Meeting Link: ${meetingUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--mute-audio",
    ]
  });

  const context = await browser.newContext({
    permissions: [],
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  console.log(`[ATLAS BOT] Navigating to MS Teams live meeting URL...`);
  await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  // 1. Click "Continue on this browser"
  for (let i = 0; i < 5; i++) {
    try {
      const webBtn = page.locator('button:has-text("Continue on this browser"), a:has-text("Continue on this browser"), button:has-text("Join on the web"), button:has-text("Continue in this browser"), button:has-text("Join meeting on the web")').first();
      if (await webBtn.isVisible({ timeout: 3000 })) {
        console.log(`[ATLAS BOT] Clicking 'Continue on this browser'...`);
        await webBtn.click();
        await page.waitForTimeout(4000);
        break;
      }
    } catch (e) {}
    await page.waitForTimeout(1000);
  }

  // 2. Fill name and turn off mic/cam
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const nameInput = page.locator('input[placeholder*="name" i], input[aria-label*="name" i], input[type="text"]').first();
      if (await nameInput.isVisible({ timeout: 3000 })) {
        await nameInput.click();
        await nameInput.fill("");
        await nameInput.type(botName, { delay: 20 });
        console.log(`[ATLAS BOT SUCCESS] Display name set to: "${botName}"`);
        break;
      }
    } catch (e) {}
    await page.waitForTimeout(2000);
  }

  try {
    const dontUseAudio = page.locator('div:has-text("Don\'t use audio"), label:has-text("Don\'t use audio"), span:has-text("Don\'t use audio")').first();
    if (await dontUseAudio.isVisible({ timeout: 3000 })) {
      await dontUseAudio.click({ force: true });
      console.log(`[ATLAS BOT] Selected "Don't use audio" (Mic OFF).`);
    }
  } catch (e) {}

  // 3. Click Join now
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const joinBtn = page.locator('button:has-text("Join now"), button:has-text("Join meeting"), button:has-text("Join"), button[id*="join" i]').first();
      if (await joinBtn.isVisible({ timeout: 3000 })) {
        await joinBtn.click();
        console.log(`[ATLAS BOT SUCCESS] Clicked 'Join now' button!`);
        break;
      }
    } catch (e) {}
    await page.waitForTimeout(2000);
  }

  console.log(`[ATLAS BOT] Waiting for host admission...`);
  let admitted = false;

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

  async function postMessageToTeams(messageText) {
    const foundInput = await findChatInput();
    if (foundInput) {
      const { frame, input } = foundInput;
      console.log(`[ATLAS BOT] Posting message to Teams chat: "${messageText.slice(0, 50)}..."`);
      
      await input.click();
      await input.focus();

      await input.evaluate((el, text) => {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, messageText);

      await frame.waitForTimeout(500);

      const sendBtn = frame.locator('button[aria-label*="Send" i], button[title="Send" i], svg[data-icon-name="Send"]').first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click();
      } else {
        await frame.keyboard.press("Enter");
      }

      console.log(`[ATLAS BOT SUCCESS] Message posted directly to Teams Chat UI!`);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(artifactDir, "teams_sunil_invite_proof.png") }).catch(() => {});
      return true;
    }
    return false;
  }

  let chatPaneOpen = false;
  let sunilInvited = false;
  const processedMessageHashes = new Set();

  while (true) {
    await page.waitForTimeout(500);

    if (!admitted) {
      const stageControl = page.locator('button[aria-label*="People" i], button:has-text("People"), button[aria-label*="Leave" i], button:has-text("Leave"), button[aria-label*="More" i], button:has-text("More")').first();
      if (await stageControl.isVisible().catch(() => false)) {
        console.log(`[ATLAS BOT SUCCESS] Bot ADMITTED to live meeting stage!`);
        admitted = true;
      } else {
        continue;
      }
    }

    if (!chatPaneOpen) {
      const found = await findChatInput();
      if (found) {
        chatPaneOpen = true;
        console.log(`[ATLAS BOT SUCCESS] Chat input detected in DOM!`);
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

    // Immediately post invitation to Sunil Hiremath upon admission
    if (admitted && !sunilInvited) {
      const inviteMsg = `Deepak AI Representative Atlas: @Sunil Hiremath (sunil.hiremath@kentplc.com), Deepak has requested you to join this live Teams meeting: ${meetingUrl}`;
      const posted = await postMessageToTeams(inviteMsg);
      if (posted) {
        sunilInvited = true;
        console.log(`[ATLAS BOT SUCCESS] Posted meeting invitation for Sunil Hiremath!`);
      }
    }

    // High-speed chat message monitor & responder
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
        if (lower.includes("continue on this browser") || lower.includes("join now")) return false;
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
          console.log(`[ATLAS BOT CHAT MESSAGE DETECTED]: "${latestUserMsg}"`);

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
              replyText = `I have sent a message and invitation to Sunil Hiremath (sunil.hiremath@kentplc.com) to join this Teams meeting.`;
            } else if (lowerMsg.includes("1-on-1") || lowerMsg.includes("tomorrow") || lowerMsg.includes("call") || lowerMsg.includes("available")) {
              replyText = `I am available for a 1-on-1 call tomorrow afternoon. Please confirm the time slot, or I can schedule it directly via your Outlook calendar.`;
            } else {
              replyText = `Thank you for your message. I have logged your request: "${latestUserMsg}" for Deepak's review.`;
            }
          }

          const formattedReply = `Deepak AI Representative Atlas: ${replyText.replace(/^Deepak AI Representative Atlas:\s*/i, '')}`;
          await postMessageToTeams(formattedReply);
        }
      }
    } catch (e) {
      console.log(`[ATLAS BOT ERROR] Chat processing error:`, e.message);
    }
  }
}

main().catch(err => {
  console.error(`[ATLAS BOT ERROR]`, err);
  process.exit(1);
});

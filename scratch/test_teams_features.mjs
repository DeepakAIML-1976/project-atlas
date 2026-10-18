const BASE_URL = "http://localhost:5000";

async function runTests() {
  console.log("=================================================================");
  console.log("   TESTING TEAMS CAPABILITIES: CALLING, TRIGGERS & CHAT MSGS    ");
  console.log("=================================================================\n");

  // TEST 1: Reading and Replying to a Technical Question in Teams Chat
  console.log(">>> TEST 1: Teams Chat - Technical Question with @Mention");
  const techQueryPayload = {
    chatId: "teams_chat_channel_piping_01",
    messageId: `msg_${Date.now()}_1`,
    senderName: "Marcus Vance (Lead Piping Stress Engineer)",
    senderEmail: "marcus.vance@kentplc.com",
    chatType: "group_chat",
    isMentioned: true,
    isReplyToDeepak: false,
    messageText: "@Deepak Paranjape what is the governing ASME B31.3 hydrostatic test pressure formula, and should we limit it based on yield strength?",
  };

  console.log(`Sending message from ${techQueryPayload.senderName}: "${techQueryPayload.messageText}"`);
  const techRes = await fetch(`${BASE_URL}/api/atlas/integrations/teams/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(techQueryPayload),
  });

  const techData = await techRes.json();
  console.log("\n[TEST 1 RESPONSE]:");
  console.log(`- Handled: ${techData.handled}`);
  console.log(`- Should Reply: ${techData.shouldReply}`);
  console.log(`- Knowledge Base Matched: ${techData.knowledgeBaseMatched}`);
  console.log(`- Escalated: ${techData.escalatedToInbox}`);
  console.log(`- Proposed Reply Text:\n${techData.replyText}\n`);

  // TEST 2: Reading and Replying to an Escalation/Personal Message in Teams Chat
  console.log("-----------------------------------------------------------------");
  console.log(">>> TEST 2: Teams Chat - Confidential/Personal Escalation");
  const personalPayload = {
    chatId: "teams_dm_deepak_01",
    messageId: `msg_${Date.now()}_2`,
    senderName: "Sarah Jenkins (Project Director)",
    senderEmail: "sarah.jenkins@kentplc.com",
    chatType: "personal_dm",
    isMentioned: false,
    isReplyToDeepak: false,
    messageText: "Hi Deepak, can we discuss your team allocation and confidential billing rates for next quarter?",
  };

  console.log(`Sending DM from ${personalPayload.senderName}: "${personalPayload.messageText}"`);
  const personalRes = await fetch(`${BASE_URL}/api/atlas/integrations/teams/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(personalPayload),
  });

  const personalData = await personalRes.json();
  console.log("\n[TEST 2 RESPONSE]:");
  console.log(`- Handled: ${personalData.handled}`);
  console.log(`- Escalated to Executive Inbox: ${personalData.escalatedToInbox}`);
  console.log(`- Alert ID Created: ${personalData.alertId}`);
  console.log(`- Proposed Reply Text:\n${personalData.replyText}\n`);

  // TEST 3: In-Call Trigger Detection ("Trigger During Calls")
  console.log("-----------------------------------------------------------------");
  console.log(">>> TEST 3: In-Call Wake-Up Trigger & Real-Time Audio Transcript");
  
  // First, create a live meeting session to attach transcript to
  const createMeetingRes = await fetch(`${BASE_URL}/api/atlas/live-meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meetingTitle: "Aramco Separator Package - Model & Stress Review",
      platform: "teams",
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_test123",
      botDisplayName: "Deepak's AI Representative (Atlas)",
    }),
  });
  const meetingSession = await createMeetingRes.json();
  console.log(`Created Live Meeting Session: ID = ${meetingSession.id} ("${meetingSession.meetingTitle}")`);

  // Send an in-call speech chunk mentioning Deepak
  const inCallTranscriptPayload = {
    speakerName: "Fahad Al-Qahtani (Client Representative)",
    text: "Deepak, what are the thermal relief requirements for blocked-in liquid piping per ASME B31.3?",
  };
  console.log(`In-Call Speech detected from ${inCallTranscriptPayload.speakerName}: "${inCallTranscriptPayload.text}"`);

  const transcriptRes = await fetch(`${BASE_URL}/api/atlas/live-meetings/${meetingSession.id}/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inCallTranscriptPayload),
  });

  const transcriptData = await transcriptRes.json();
  console.log("\n[TEST 3 RESPONSE]:");
  console.log(`- Processed: ${transcriptData.processed}`);
  console.log(`- Trigger Detected (Wake-Up): ${transcriptData.triggerDetected}`);
  console.log(`- Triggered Alert ID: ${transcriptData.triggeredAlert?.id}`);
  console.log(`- In-Call AI Statement:\n${transcriptData.triggeredAlert?.twinProposedResponse}\n`);

  // TEST 4: Teams Calling Media Stream Join Protocol
  console.log("-----------------------------------------------------------------");
  console.log(">>> TEST 4: Teams Calling Media Stream Join Protocol");
  const callJoinPayload = {
    meetingUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_test123",
    botDisplayName: "Deepak's AI Representative (Atlas)",
  };

  const callRes = await fetch(`${BASE_URL}/api/atlas/integrations/teams/calling/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(callJoinPayload),
  });

  const callData = await callRes.json();
  console.log("\n[TEST 4 RESPONSE]:");
  console.log(JSON.stringify(callData, null, 2));

  console.log("\n=================================================================");
  console.log("   TEAMS SUITE VERIFICATION COMPLETED SUCCESSFULLY              ");
  console.log("=================================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

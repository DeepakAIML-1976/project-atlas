const res = await fetch('http://localhost:5000/api/atlas/authorization-inbox', {
  headers: { 'X-Owner-Email': 'deepak.paranjape@kentplc.com' }
});
const data = await res.json();
console.log('Pending emails count:', data.pendingEmails?.length || 0);
console.log('Pending triggers count:', data.pendingMeetingTriggers?.length || 0);

const triggers = data.pendingMeetingTriggers || [];
if (triggers.length > 0) {
  const latest = triggers[0];
  console.log('Latest Trigger ID:', latest.id);
  console.log('Speaker:', latest.speakerName);
  console.log('Question:', latest.questionAsked);
  console.log('Twin Response:', latest.twinProposedResponse);
}

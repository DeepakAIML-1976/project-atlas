import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, Plus, AlertTriangle, Sparkles, Send, CheckCircle2, PhoneOff, ShieldCheck, MessageSquare, Bot, UserCheck } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';
import { Link } from 'wouter';

interface LiveMeeting {
  id: string;
  meetingTitle: string;
  platform: string;
  meetingUrl?: string | null;
  botStatus: string;
  botDisplayName: string;
  joinedAt?: string | null;
  leftAt?: string | null;
  createdAt: string;
}

interface TriggerAlert {
  id: string;
  liveMeetingId: string;
  speakerName?: string | null;
  triggerPhrase: string;
  questionAsked: string;
  twinProposedResponse: string;
  outputMode: string;
  humanAlertStatus: string;
  createdAt: string;
}

interface LiveMeetingDetail {
  meeting: LiveMeeting;
  triggers: TriggerAlert[];
  notes?: string | null;
}

export function LiveMeetings() {
  const queryClient = useQueryClient();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Form state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [platform, setPlatform] = useState('teams');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [botDisplayName, setBotDisplayName] = useState("Deepak's AI Representative (Atlas)");

  // Live simulator transcript state
  const [speakerName, setSpeakerName] = useState('VP Projects');
  const [transcriptText, setTranscriptText] = useState('Deepak, what flange rating and material specification do you recommend for the wet sour gas line?');
  const [lastTranscriptResult, setLastTranscriptResult] = useState<{ triggerDetected: boolean; note?: string } | null>(null);

  const meetingsQuery = useQuery<{ liveMeetings: LiveMeeting[] }>({
    queryKey: ['/api/atlas/live-meetings'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/live-meetings');
      if (!res.ok) throw new Error('Failed to fetch live meetings');
      return res.json();
    },
  });

  const detailQuery = useQuery<LiveMeetingDetail>({
    queryKey: ['/api/atlas/live-meetings', selectedMeetingId],
    queryFn: async () => {
      if (!selectedMeetingId) throw new Error('No meeting selected');
      const res = await fetch(`/api/atlas/live-meetings/${selectedMeetingId}`);
      if (!res.ok) throw new Error('Failed to fetch meeting detail');
      return res.json();
    },
    enabled: !!selectedMeetingId,
  });

  const deployMutation = useMutation({
    mutationFn: async (payload: { meetingTitle: string; platform: string; meetingUrl?: string; botDisplayName: string }) => {
      const res = await fetch('/api/atlas/live-meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to deploy meeting bot');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings'] });
      setIsDeploying(false);
      setSelectedMeetingId(data.id);
      setMeetingTitle('');
      setMeetingUrl('');
    },
  });

  const transcriptMutation = useMutation({
    mutationFn: async (payload: { speakerName: string; text: string }) => {
      if (!selectedMeetingId) return;
      const res = await fetch(`/api/atlas/live-meetings/${selectedMeetingId}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to ingest transcript');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings', selectedMeetingId] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
      setLastTranscriptResult({
        triggerDetected: data.triggerDetected,
        note: data.extractedNote,
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (botStatus: 'in_call' | 'left' | 'errored') => {
      if (!selectedMeetingId) return;
      const res = await fetch(`/api/atlas/live-meetings/${selectedMeetingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings', selectedMeetingId] });
    },
  });

  if (meetingsQuery.isLoading) return <Load count={4} />;
  if (meetingsQuery.isError) return <ErrorState retry={() => meetingsQuery.refetch()} />;

  const meetings = meetingsQuery.data?.liveMeetings ?? [];

  const handleDeploySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    deployMutation.mutate({
      meetingTitle: meetingTitle.trim(),
      platform,
      meetingUrl: meetingUrl.trim() || undefined,
      botDisplayName: botDisplayName.trim(),
    });
  };

  const handleSendTranscript = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcriptText.trim()) return;
    transcriptMutation.mutate({
      speakerName: speakerName.trim() || 'Speaker',
      text: transcriptText.trim(),
    });
  };

  return (
    <>
      <PageHead
        eyebrow="COGNITIVE SUITE / LIVE MEETING BOT & ACOUSTIC TRIGGER ENGINE"
        title="Live Meeting AI Representative"
        italic="always identified."
        description="Deploys your digital twin as an explicitly labeled AI bot ('Deepak's AI Representative (Atlas)') to live Teams/Zoom meetings. Listens to live conversation, logs notes/actions, and triggers name wake-up alerts directly to your Executive Authorization Inbox."
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-outline"
              onClick={async () => {
                try {
                  const res = await fetch('/api/atlas/integrations/teams/sync', { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok || !data.success) {
                    alert(`Live Teams Sync Setup Required:\n\n${data.error || 'Configure Microsoft Graph API credentials in your .env file.'}\n\nKey: MS_GRAPH_ACCESS_TOKEN or MS_GRAPH_CLIENT_ID`);
                  } else {
                    alert(`Successfully synced ${data.count} live MS Teams online meetings!`);
                    queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings'] });
                  }
                } catch (err: any) {
                  alert(`Teams Sync Error: ${err.message}`);
                }
              }}
            >
              <Video size={15} /> Sync Live MS Teams
            </button>

            <button
              className="btn btn-outline"
              onClick={async () => {
                try {
                  const res = await fetch('/api/atlas/integrations/zoom/sync', { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok || !data.success) {
                    alert(`Live Zoom Sync Setup Required:\n\n${data.error || 'Configure Zoom OAuth credentials in your .env file.'}\n\nKey: ZOOM_ACCESS_TOKEN or ZOOM_CLIENT_ID`);
                  } else {
                    alert(`Successfully synced ${data.count} live Zoom meetings!`);
                    queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings'] });
                  }
                } catch (err: any) {
                  alert(`Zoom Sync Error: ${err.message}`);
                }
              }}
            >
              <Video size={15} /> Sync Live Zoom
            </button>

            <button className="btn btn-primary" style={{ fontWeight: 600 }} onClick={() => setIsDeploying(true)}>
              <Plus size={15} /> Connect MS Teams / Zoom Meeting Link
            </button>
          </div>
        }
      />

      <div className="grid-two">
        {/* Left Column: Meeting Sessions List */}
        <div>
          <div className="section-heading" style={{ marginTop: 0 }}>
            <h2>Meeting Bot Sessions</h2>
            <span>REAL-TIME DEPLOYMENT</span>
          </div>

          {meetings.length === 0 ? (
            <Empty
              icon={Video}
              title="No Active Meeting Sessions"
              description="Deploy Deepak's AI Representative to a Teams or Zoom call to begin real-time meeting representation, note logging, and acoustic wake-up triggers."
              action={
                <button className="btn btn-primary" style={{ fontWeight: 600 }} onClick={() => setIsDeploying(true)}>
                  <Plus size={14} /> Connect MS Teams / Zoom Meeting Link
                </button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className={`card card-pad ${selectedMeetingId === m.id ? 'active' : ''}`}
                  style={{
                    cursor: 'pointer',
                    borderLeft: selectedMeetingId === m.id ? '4px solid #c65131' : '1px solid #d8d1c8',
                  }}
                  onClick={() => setSelectedMeetingId(m.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className={`badge ${m.botStatus === 'in_call' ? 'green' : 'orange'}`}>
                      {m.botStatus === 'in_call' ? '🟢 In Call' : m.botStatus}
                    </span>
                    <span className="badge">{m.platform.toUpperCase()}</span>
                  </div>

                  <h3 style={{ fontSize: 16, margin: '4px 0 6px', fontWeight: 600 }}>{m.meetingTitle}</h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
                    <Bot size={13} color="#c65131" />
                    <span>Identity: <strong>{m.botDisplayName}</strong></span>
                  </div>

                  <div className="muted tiny" style={{ marginTop: 8 }}>
                    Started: {formatDate(m.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Live Simulator & Trigger Console */}
        <div>
          {selectedMeetingId && detailQuery.data ? (
            <div className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div className="eyebrow">LIVE MEETING CONTROL CENTER</div>
                  <h2 style={{ fontSize: 20, margin: '4px 0' }}>{detailQuery.data.meeting.meetingTitle}</h2>
                </div>
                {detailQuery.data.meeting.botStatus === 'in_call' ? (
                  <button
                    className="btn btn-outline"
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => statusMutation.mutate('left')}
                  >
                    <PhoneOff size={14} /> Leave Call
                  </button>
                ) : (
                  <span className="badge">Meeting Ended</span>
                )}
              </div>

              <div style={{ background: '#f4f1eb', padding: '12px 16px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 600, marginBottom: 4 }}>
                  <UserCheck size={16} /> Transparent AI Identity Enforced:
                </div>
                <div style={{ color: '#374151' }}>
                  Bot is broadcasting display name: <strong>"{detailQuery.data.meeting.botDisplayName}"</strong>
                </div>
              </div>

              {/* Transcript Speech Stream Simulator */}
              <div className="section-heading">
                <h2>Acoustic & Speech Simulator</h2>
                <span>TEST NAME WAKE-UP</span>
              </div>

              <form onSubmit={handleSendTranscript} style={{ marginBottom: 20 }}>
                <div className="field">
                  <label className="label">Meeting Participant Speaker Name</label>
                  <input
                    className="input"
                    value={speakerName}
                    onChange={(e) => setSpeakerName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label className="label">Simulated Spoken Audio Transcript Text</label>
                  <textarea
                    className="input"
                    value={transcriptText}
                    onChange={(e) => setTranscriptText(e.target.value)}
                    style={{ minHeight: 80 }}
                    placeholder="Type spoken sentence in call (include 'Deepak' to test acoustic trigger)..."
                    required
                  />
                </div>

                <button className="btn btn-primary" disabled={transcriptMutation.isPending} style={{ width: '100%' }}>
                  <Send size={14} /> Ingest Live Audio Stream Line <Sparkles size={14} />
                </button>
              </form>

              {lastTranscriptResult && (
                <div style={{ marginBottom: 20 }}>
                  {lastTranscriptResult.triggerDetected ? (
                    <div className="notice" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
                      <AlertTriangle size={18} />
                      <div>
                        <strong>Acoustic Trigger Activated! ("Deepak" called out in meeting)</strong>
                        <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                          Atlas synthesized an SME response and dispatched a high-priority alert to your Executive Authorization Inbox for sign-off!
                        </p>
                        <Link href="/authorization-inbox" className="btn btn-outline" style={{ marginTop: 8, fontSize: 11, padding: '4px 10px' }}>
                          Open Executive Inbox <ShieldCheck size={12} />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: 6, fontSize: 12, color: '#166534' }}>
                      ✓ Audio line processed. No name wake-up trigger detected. Notes logged automatically.
                    </div>
                  )}
                  {lastTranscriptResult.note && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#4b5563', fontStyle: 'italic' }}>
                      📝 {lastTranscriptResult.note}
                    </div>
                  )}
                </div>
              )}

              {/* Recorded Triggers list */}
              <div className="section-heading">
                <h2>Meeting Name Wake-Up Trigger Alerts ({detailQuery.data.triggers.length})</h2>
                <span>HUMAN SIGN-OFF REQUIRED</span>
              </div>

              {detailQuery.data.triggers.length === 0 ? (
                <p className="muted tiny">No wake-up alerts triggered in this meeting yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {detailQuery.data.triggers.map((t) => (
                    <div key={t.id} style={{ background: '#fffdf9', border: '1px solid #e5dfd5', padding: '12px 16px', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span className="badge red">Speaker: {t.speakerName || 'Unknown'}</span>
                        <span className="badge">{t.humanAlertStatus}</span>
                      </div>

                      <div style={{ fontSize: 13, marginBottom: 8 }}>
                        <strong>Question Asked:</strong> "{t.questionAsked}"
                      </div>

                      <div style={{ background: '#f4f1eb', padding: '10px 12px', borderRadius: 4, fontSize: 12 }}>
                        <strong>Proposed Response:</strong> {t.twinProposedResponse}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Empty
              icon={Video}
              title="Select a Meeting Session"
              description="Click on any meeting session on the left to view the live control center, test acoustic triggers, or view recorded wake-up alerts."
            />
          )}
        </div>
      </div>

      {/* Deploy Bot Modal */}
      {isDeploying && (
        <Modal
          title="Deploy Digital Twin Bot to Live Meeting"
          subtitle="Your twin will join as an explicitly identified AI representative to take notes and route name wake-up queries to your inbox."
          onClose={() => setIsDeploying(false)}
        >
          <form onSubmit={handleDeploySubmit}>
            <div className="field">
              <label className="label" htmlFor="m-title">Meeting Title</label>
              <input
                id="m-title"
                className="input"
                placeholder="e.g. Piping Material Spec Review & HAZOP Align"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label">Meeting Platform</label>
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="teams">Microsoft Teams</option>
                <option value="zoom">Zoom</option>
                <option value="meet">Google Meet</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="m-url">Meeting Join URL (Optional)</label>
              <input
                id="m-url"
                className="input"
                placeholder="e.g. https://teams.microsoft.com/l/meetup-join/..."
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="m-name">Bot Transparent Display Name</label>
              <input
                id="m-name"
                className="input"
                value={botDisplayName}
                onChange={(e) => setBotDisplayName(e.target.value)}
                required
              />
            </div>

            <GoverningNote>
              Ethical Governance Rule: The AI bot will always display "{botDisplayName}" in the participant list to prevent any impersonation or ambiguity.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsDeploying(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={deployMutation.isPending}>
                {deployMutation.isPending ? 'Deploying Bot…' : 'Deploy Bot to Call'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, Plus, AlertTriangle, Sparkles, Send, CheckCircle2, PhoneOff, ShieldCheck, MessageSquare, Bot, UserCheck, RefreshCw, Link as LinkIcon, Trash2, Calendar, CalendarClock, ExternalLink, Play } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';
import { Link } from 'wouter';

interface LiveMeeting {
  id: string;
  meetingTitle: string;
  platform: string;
  meetingUrl?: string | null;
  botStatus: string;
  botDisplayName: string;
  scheduledAt?: string | null;
  location?: string | null;
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

interface LinkedAccount {
  id: string;
  accountType: string;
  accountEmail: string;
  displayName?: string | null;
  syncEnabled: boolean;
  lastSyncedAt?: string | null;
  createdAt: string;
}

export function LiveMeetings() {
  const queryClient = useQueryClient();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);

  // Form state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [platform, setPlatform] = useState('teams');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [botDisplayName, setBotDisplayName] = useState("Deepak AI Representative Atlas");

  // Account Linking Form state
  const [accountType, setAccountType] = useState<'teams_personal' | 'teams_company'>('teams_company');
  const [accountEmail, setAccountEmail] = useState('Deepak.Paranjape@kentplc.com');
  const [accountDisplayName, setAccountDisplayName] = useState('Deepak Paranjape (Kent PLC / Kentech Group DMCC)');
  const [accessToken, setAccessToken] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tokenVerification, setTokenVerification] = useState<{ valid?: boolean; error?: string; email?: string } | null>(null);

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

  const accountsQuery = useQuery<{ accounts: LinkedAccount[] }>({
    queryKey: ['/api/atlas/integrations/accounts'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/integrations/accounts');
      if (!res.ok) throw new Error('Failed to fetch linked accounts');
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

  const [filterTab, setFilterTab] = useState<'all' | 'scheduled' | 'week' | 'in_call'>('all');

  const outlookStatusQuery = useQuery<{
    platform: string;
    isDesktopAvailable: boolean;
    isRunning: boolean;
    account: string;
    message: string;
  }>({
    queryKey: ['/api/atlas/integrations/outlook/status'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/integrations/outlook/status');
      if (!res.ok) throw new Error('Failed to fetch Outlook status');
      return res.json();
    },
    refetchInterval: 8000,
  });

  const syncOutlookCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/atlas/integrations/outlook/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 14 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync Outlook calendar');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings'] });
      alert(`Outlook Calendar Sync Complete!\n\nIngested ${data.count || 0} active meetings from Outlook calendar into your digital twin.`);
    },
    onError: (err: any) => {
      alert(`Calendar Sync Notice: ${err.message}`);
    },
  });

  const toggleBotAssignmentMutation = useMutation({
    mutationFn: async ({ meetingId, newStatus }: { meetingId: string; newStatus: 'scheduled' | 'idle' }) => {
      const res = await fetch(`/api/atlas/live-meetings/${meetingId}/bot-assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botStatus: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update bot assignment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings', selectedMeetingId] });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/atlas/integrations/accounts/sync-all', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to sync accounts');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/live-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/integrations/accounts'] });
      alert(`Calendar Sync Complete!\n\nProcessed ${data.totalAccounts || 0} linked MS Teams & Outlook account(s).`);
    },
  });

  const linkAccountMutation = useMutation({
    mutationFn: async (payload: { accountType: string; accountEmail: string; displayName?: string; accessToken?: string; tenantId?: string; clientId?: string; clientSecret?: string }) => {
      const res = await fetch('/api/atlas/integrations/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to link account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/integrations/accounts'] });
      setIsLinkingAccount(false);
      setAccountEmail('');
      setAccountDisplayName('');
      syncAllMutation.mutate();
    },
  });

  const unlinkAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/atlas/integrations/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unlink account');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/integrations/accounts'] });
    },
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
      alert(`Bot Deployment Initiated!\n\n${data.botDisplayName} is actively navigating to your Teams meeting URL.\n\nOpen your Teams call window and click 'Admit' when you see the lobby notification.`);
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
  const linkedAccounts = accountsQuery.data?.accounts ?? [];

  const filteredMeetings = meetings.filter((m) => {
    if (filterTab === 'scheduled') return m.botStatus === 'scheduled';
    if (filterTab === 'in_call') return m.botStatus === 'in_call';
    if (filterTab === 'week') {
      if (!m.scheduledAt) return false;
      const d = new Date(m.scheduledAt).getTime();
      const now = Date.now();
      return d >= now - 86400000 && d <= now + 7 * 86400000;
    }
    return true;
  });

  const handleDeploySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    deployMutation.mutate({
      meetingTitle: meetingTitle.trim(),
      platform,
      meetingUrl: meetingUrl.trim() || undefined,
      botDisplayName: botDisplayName.trim(),
    });
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountEmail.trim()) return;
    linkAccountMutation.mutate({
      accountType,
      accountEmail: accountEmail.trim(),
      displayName: accountDisplayName.trim() || (accountType === 'teams_personal' ? "Deepak Paranjape (Personal)" : "Deepak Paranjape (Kent PLC / Kentech Group DMCC)"),
      accessToken: accessToken.trim() || undefined,
      tenantId: tenantId.trim() || undefined,
      clientId: clientId.trim() || undefined,
      clientSecret: clientSecret.trim() || undefined,
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
        eyebrow="COGNITIVE SUITE / LIVE MEETING BOT & OUTLOOK CALENDAR"
        title="Live Meeting AI Representative"
        italic="always identified."
        description="Sync your desktop Outlook calendar (deepak.paranjape@kentplc.com). Review upcoming meetings for the week, select which sessions Deepak's AI Representative will attend, and review live transcripts."
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline"
              disabled={syncOutlookCalendarMutation.isPending}
              onClick={() => syncOutlookCalendarMutation.mutate()}
              style={{ fontWeight: 600, borderColor: '#c65131', color: '#c65131' }}
            >
              <CalendarClock size={15} className={syncOutlookCalendarMutation.isPending ? 'spin' : ''} />
              {syncOutlookCalendarMutation.isPending ? 'Syncing Outlook...' : 'Sync Outlook Calendar'}
            </button>

            <button
              className="btn btn-outline"
              disabled={syncAllMutation.isPending}
              onClick={() => syncAllMutation.mutate()}
            >
              <RefreshCw size={15} className={syncAllMutation.isPending ? 'spin' : ''} /> Sync Linked Accounts
            </button>

            <button className="btn btn-outline" onClick={() => setIsLinkingAccount(true)}>
              <LinkIcon size={15} /> Link MS Teams Account
            </button>

            <button className="btn btn-primary" style={{ fontWeight: 600 }} onClick={() => setIsDeploying(true)}>
              <Plus size={15} /> Connect Meeting Link
            </button>
          </div>
        }
      />

      {/* Outlook Application Notice Banner if Outlook is closed */}
      {outlookStatusQuery.data && !outlookStatusQuery.data.isRunning && (
        <div className="notice" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>Outlook Desktop Application Notice</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.4 }}>
              The desktop Outlook application is currently closed on this system. Please open Outlook (<code>deepak.paranjape@kentplc.com</code>) to allow continuous weekly and daily calendar and email ingestion.
            </p>
          </div>
        </div>
      )}

      {/* Linked MS Teams Accounts Panel */}
      <div className="card card-pad" style={{ marginBottom: 24, background: '#faf8f5', borderColor: '#e2dcd2' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Linked MS Teams & Outlook Accounts ({linkedAccounts.length})
            </h3>
            <span style={{ fontSize: 12, color: '#666' }}>
              Multi-account daily calendar sync active • Zero mock data policy enforced
            </span>
          </div>

          <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setIsLinkingAccount(true)}>
            <Plus size={13} /> Add Teams Account
          </button>
        </div>

        {linkedAccounts.length === 0 ? (
          <div style={{ padding: '12px 16px', background: '#fff', borderRadius: 6, border: '1px dashed #ccc', fontSize: 13, color: '#555' }}>
            No MS Teams accounts linked yet. Click <strong>"Add Teams Account"</strong> above to link your Personal and Company Microsoft Teams accounts for automatic daily calendar synchronization.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {linkedAccounts.map((acc) => (
              <div key={acc.id} style={{ background: '#fff', padding: '12px 14px', borderRadius: 6, border: '1px solid #e0d8cc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span className={`badge ${acc.accountType.includes('company') ? 'blue' : 'green'}`}>
                      {acc.accountType === 'teams_company' ? '🏢 Company Teams' : '👤 Personal Teams'}
                    </span>
                    <span className="badge">Active Sync</span>
                  </div>
                  <strong style={{ fontSize: 14, color: '#222' }}>{acc.accountEmail}</strong>
                  <div className="muted tiny" style={{ marginTop: 4 }}>
                    Last Synced: {acc.lastSyncedAt ? formatDate(acc.lastSyncedAt) : 'Just Now'}
                  </div>
                </div>

                <button
                  className="btn btn-outline"
                  style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '4px 8px' }}
                  onClick={() => unlinkAccountMutation.mutate(acc.id)}
                  title="Unlink Account"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-two">
        {/* Left Column: Meeting Sessions List */}
        <div>
          <div className="section-heading" style={{ marginTop: 0 }}>
            <h2>Upcoming & Active Meetings ({filteredMeetings.length})</h2>
            <span>OUTLOOK & TEAMS SYNC</span>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${filterTab === 'all' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setFilterTab('all')}
            >
              All Meetings ({meetings.length})
            </button>
            <button
              type="button"
              className={`btn ${filterTab === 'scheduled' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setFilterTab('scheduled')}
            >
              🤖 Scheduled for Bot ({meetings.filter((m) => m.botStatus === 'scheduled').length})
            </button>
            <button
              type="button"
              className={`btn ${filterTab === 'week' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setFilterTab('week')}
            >
              📅 Next 7 Days ({meetings.filter((m) => {
                if (!m.scheduledAt) return false;
                const d = new Date(m.scheduledAt).getTime();
                const now = Date.now();
                return d >= now - 86400000 && d <= now + 7 * 86400000;
              }).length})
            </button>
            <button
              type="button"
              className={`btn ${filterTab === 'in_call' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setFilterTab('in_call')}
            >
              🟢 In-Call ({meetings.filter((m) => m.botStatus === 'in_call').length})
            </button>
          </div>

          {filteredMeetings.length === 0 ? (
            <Empty
              icon={Video}
              title={filterTab === 'scheduled' ? "No Meetings Scheduled for AI Bot" : "No Meetings Found"}
              description={
                filterTab === 'scheduled'
                  ? "Click 'Attend with AI Live Bot' on any upcoming meeting below to let Deepak's AI Representative represent you in that meeting."
                  : "Sync your desktop Outlook calendar or add a meeting link to begin live representation and logging."
              }
              action={
                <button
                  className="btn btn-primary"
                  style={{ fontWeight: 600 }}
                  onClick={() => syncOutlookCalendarMutation.mutate()}
                  disabled={syncOutlookCalendarMutation.isPending}
                >
                  <CalendarClock size={14} /> Sync Outlook Calendar
                </button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredMeetings.map((m) => {
                const isSelected = selectedMeetingId === m.id;
                const isScheduled = m.botStatus === 'scheduled';
                const isInCall = m.botStatus === 'in_call';

                return (
                  <div
                    key={m.id}
                    className={`card card-pad ${isSelected ? 'active' : ''}`}
                    style={{
                      cursor: 'pointer',
                      borderLeft: isSelected
                        ? '4px solid #c65131'
                        : isScheduled
                        ? '4px solid #2563eb'
                        : '1px solid #d8d1c8',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setSelectedMeetingId(m.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge ${isInCall ? 'green' : isScheduled ? 'blue' : ''}`}>
                          {isInCall ? '🟢 In Call' : isScheduled ? '🤖 Live Bot Scheduled' : '⚪ Bot Idle'}
                        </span>
                        <span className="badge">{m.platform.toUpperCase()}</span>
                      </div>

                      {m.scheduledAt && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb' }}>
                          📅 {new Date(m.scheduledAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: 15, margin: '4px 0 6px', fontWeight: 600, color: '#111' }}>{m.meetingTitle}</h3>

                    {m.location && (
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                        📍 {m.location}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', marginBottom: 10 }}>
                      <Bot size={13} color="#c65131" />
                      <span>Identity: <strong>{m.botDisplayName}</strong></span>
                    </div>

                    {/* Action buttons row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0eae1', paddingTop: 8, marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={`btn ${isScheduled ? 'btn-outline' : 'btn-primary'}`}
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            fontWeight: 600,
                            borderColor: isScheduled ? '#10b981' : undefined,
                            color: isScheduled ? '#047857' : undefined,
                            background: isScheduled ? '#f0fdf4' : undefined,
                          }}
                          disabled={toggleBotAssignmentMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBotAssignmentMutation.mutate({
                              meetingId: m.id,
                              newStatus: isScheduled ? 'idle' : 'scheduled',
                            });
                          }}
                        >
                          {isScheduled ? (
                            <>
                              <CheckCircle2 size={12} /> Live Bot Scheduled
                            </>
                          ) : (
                            <>
                              <Bot size={12} /> Attend with AI Live Bot
                            </>
                          )}
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        {m.meetingUrl && (
                          <a
                            href={m.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-outline"
                            style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={12} /> Join Call
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                  {detailQuery.data.meeting.scheduledAt && (
                    <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 2 }}>
                      📅 Scheduled: {formatDate(detailQuery.data.meeting.scheduledAt)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {detailQuery.data.meeting.botStatus === 'in_call' ? (
                    <button
                      className="btn btn-outline"
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={() => statusMutation.mutate('left')}
                    >
                      <PhoneOff size={14} /> Leave Call
                    </button>
                  ) : detailQuery.data.meeting.botStatus === 'scheduled' ? (
                    <button
                      className="btn btn-outline"
                      style={{ borderColor: '#10b981', color: '#047857', background: '#f0fdf4' }}
                      disabled={toggleBotAssignmentMutation.isPending}
                      onClick={() =>
                        toggleBotAssignmentMutation.mutate({
                          meetingId: detailQuery.data.meeting.id,
                          newStatus: 'idle',
                        })
                      }
                    >
                      <CheckCircle2 size={14} /> Bot Scheduled (Click to Unassign)
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={toggleBotAssignmentMutation.isPending}
                      onClick={() =>
                        toggleBotAssignmentMutation.mutate({
                          meetingId: detailQuery.data.meeting.id,
                          newStatus: 'scheduled',
                        })
                      }
                    >
                      <Bot size={14} /> Attend with AI Live Bot
                    </button>
                  )}
                </div>
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

      {/* Link MS Teams Account Modal */}
      {isLinkingAccount && (
        <Modal
          title="Connect Live Microsoft Teams Account"
          subtitle="Connect Deepak.Paranjape@kentplc.com (Kentech Group DMCC / Kent PLC) or dpengineeringservices@gmail.com for authentic Graph API calendar streaming."
          onClose={() => setIsLinkingAccount(false)}
        >
          <form onSubmit={handleLinkSubmit}>
            <div className="field">
              <label className="label">Account Category</label>
              <select
                className="input"
                value={accountType}
                onChange={(e) => {
                  const type = e.target.value as any;
                  setAccountType(type);
                  if (type === 'teams_company') {
                    setAccountEmail('Deepak.Paranjape@kentplc.com');
                    setAccountDisplayName('Deepak Paranjape (Kent PLC / Kentech Group DMCC)');
                  } else {
                    setAccountEmail('dpengineeringservices@gmail.com');
                    setAccountDisplayName('Deepak Paranjape (Personal)');
                  }
                }}
              >
                <option value="teams_company">🏢 Kentech Group DMCC / Kent PLC (Deepak.Paranjape@kentplc.com)</option>
                <option value="teams_personal">👤 Personal Teams Account (dpengineeringservices@gmail.com)</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="acc-email">Account Email Address</label>
              <input
                id="acc-email"
                className="input"
                type="email"
                placeholder={accountType === 'teams_personal' ? 'dpengineeringservices@gmail.com' : 'Deepak.Paranjape@kentplc.com'}
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="acc-token">Microsoft Graph Access Token (Live Bearer Token)</label>
              <input
                id="acc-token"
                className="input"
                type="password"
                placeholder="Paste Bearer Access Token (e.g. eyJ0eXAi...)"
                value={accessToken}
                onChange={(e) => {
                  setAccessToken(e.target.value);
                  setTokenVerification(null);
                }}
              />
              <span style={{ fontSize: 11, color: '#666' }}>
                Obtain via Azure CLI (<code>az account get-access-token --resource https://graph.microsoft.com</code>) or Graph Explorer.
              </span>
            </div>

            {accessToken && (
              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/atlas/integrations/accounts/verify-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accessToken }),
                      });
                      const contentType = res.headers.get('content-type') || '';
                      if (!contentType.includes('application/json')) {
                        throw new Error(`Server endpoint returned non-JSON (${res.status}). Please refresh or restart server.`);
                      }
                      const data = await res.json();
                      setTokenVerification(data);
                    } catch (err: any) {
                      setTokenVerification({ valid: false, error: err.message });
                    }
                  }}
                >
                  <ShieldCheck size={14} /> Test Live MS Graph API Token
                </button>

                {tokenVerification && (
                  <div style={{ marginTop: 8 }}>
                    {tokenVerification.valid ? (
                      <div className="notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', fontSize: 12 }}>
                        <CheckCircle2 size={16} /> Verified Live MS Graph Connection for <strong>{tokenVerification.email}</strong>!
                      </div>
                    ) : (
                      <div className="notice" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontSize: 12 }}>
                        <AlertTriangle size={16} /> Token Verification Failed: {tokenVerification.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ borderTop: '1px solid #e0d8cc', paddingTop: 12, marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 8 }}>
                Or Provide Azure AD App Credentials (Alternative for Kent PLC Tenant):
              </div>
              <div className="grid-two" style={{ gap: 8 }}>
                <div className="field">
                  <label className="label">Azure Tenant ID</label>
                  <input className="input" placeholder="e.g. 72f988bf-..." value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Azure App Client ID</label>
                  <input className="input" placeholder="e.g. 9b12a84c-..." value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label className="label">Azure Client Secret</label>
                <input className="input" type="password" placeholder="Client secret value" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
              </div>
            </div>

            <GoverningNote>
              Zero Mock Policy: Connecting your authentic token or credentials will stream live Microsoft Teams meetings and Outlook emails directly into your Cognitive Twin.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsLinkingAccount(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={linkAccountMutation.isPending}>
                {linkAccountMutation.isPending ? 'Connecting Live Stream…' : 'Connect Live Account Stream'}
              </button>
            </div>
          </form>
        </Modal>
      )}

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

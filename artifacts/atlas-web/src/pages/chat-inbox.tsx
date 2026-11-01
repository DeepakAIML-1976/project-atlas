import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, RefreshCw, Plus, Sparkles, CheckCircle2, Copy, Send, Trash2, Edit3, Bot, Video } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';

interface ChatDraft {
  id: string;
  platform: 'teams' | 'zoom';
  chatId: string;
  messageId: string;
  senderName: string;
  senderEmail?: string | null;
  incomingMessage: string;
  twinDraftResponse: string;
  reasoning?: string | null;
  confidence?: number | null;
  status: 'ingested' | 'pending_authorization' | 'approved' | 'sent';
  authorizedAt?: string | null;
  createdAt: string;
}

export function ChatInbox() {
  const queryClient = useQueryClient();
  const [filterPlatform, setFilterPlatform] = useState<'all' | 'teams' | 'zoom'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ingested' | 'pending' | 'approved'>('all');
  const [isSimulating, setIsSimulating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Simulation Form State
  const [simPlatform, setSimPlatform] = useState<'teams' | 'zoom'>('teams');
  const [simChatId, setSimChatId] = useState('5884-Alky Reactor Replacement Model Review');
  const [simSenderName, setSimSenderName] = useState('Sarah Jenkins (Process Lead)');
  const [simSenderEmail, setSimSenderEmail] = useState('sarah.jenkins@kentplc.com');
  const [simMessage, setSimMessage] = useState('Deepak, in the 5884 unit layout, do we require 300# or 600# flange rating for the sour gas bypass line?');

  const chatQuery = useQuery<{ chatDrafts: ChatDraft[] }>({
    queryKey: ['/api/atlas/chat-drafts', filterPlatform, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterPlatform !== 'all') params.set('platform', filterPlatform);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/atlas/chat-drafts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch chat drafts');
      return res.json();
    },
    refetchInterval: 8000,
  });

  const syncChatMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/atlas/integrations/chat/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to sync chat messages');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/chat-drafts'] });
      alert(`Chat Message Sync Complete!\n\nIngested ${data.totalNew || 0} new message(s) (Teams: ${data.teamsCount || 0}, Zoom: ${data.zoomCount || 0}).`);
    },
    onError: (err: any) => {
      alert(`Sync Notice: ${err.message}`);
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (payload: { platform: string; chatId: string; senderName: string; senderEmail?: string; incomingMessage: string }) => {
      const res = await fetch('/api/atlas/chat-drafts/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to ingest chat message');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/chat-drafts'] });
      setIsSimulating(false);
    },
  });

  const generateDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/atlas/chat-drafts/${id}/generate-draft`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate draft');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/chat-drafts'] });
    },
    onError: (err: any) => {
      alert(`Draft Generation Error: ${err.message}`);
    },
  });

  const saveEditMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await fetch(`/api/atlas/chat-drafts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twinDraftResponse: text }),
      });
      if (!res.ok) throw new Error('Failed to update draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/chat-drafts'] });
      setEditingId(null);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/atlas/chat-drafts/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/chat-drafts'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/atlas/chat-drafts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete message');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/chat-drafts'] });
    },
  });

  const handleSimulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simMessage.trim() || !simSenderName.trim()) return;
    ingestMutation.mutate({
      platform: simPlatform,
      chatId: simChatId.trim() || 'General Meeting Chat',
      senderName: simSenderName.trim(),
      senderEmail: simSenderEmail.trim() || undefined,
      incomingMessage: simMessage.trim(),
    });
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  if (chatQuery.isLoading) return <Load count={4} />;
  if (chatQuery.isError) return <ErrorState retry={() => chatQuery.refetch()} />;

  const messages = chatQuery.data?.chatDrafts ?? [];

  return (
    <>
      <PageHead
        eyebrow="COGNITIVE SUITE / TEAMS & ZOOM CHAT MONITORING"
        title="Teams & Zoom Chat Ingest"
        italic="selective AI replies."
        description="Monitor incoming messages across Microsoft Teams and Zoom. Ingested messages arrive cleanly—select which messages receive an AI-drafted reply grounded in Deepak's golden heuristics."
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline"
              disabled={syncChatMutation.isPending}
              onClick={() => syncChatMutation.mutate()}
              style={{ fontWeight: 600, borderColor: '#c65131', color: '#c65131' }}
            >
              <RefreshCw size={14} className={syncChatMutation.isPending ? 'spin' : ''} />
              {syncChatMutation.isPending ? 'Scanning Chats...' : 'Sync Teams & Zoom Messages'}
            </button>

            <button className="btn btn-primary" style={{ fontWeight: 600 }} onClick={() => setIsSimulating(true)}>
              <Plus size={14} /> Ingest / Test Message
            </button>
          </div>
        }
      />

      {/* Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        {/* Platform filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn ${filterPlatform === 'all' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => setFilterPlatform('all')}
          >
            All Platforms ({messages.length})
          </button>
          <button
            type="button"
            className={`btn ${filterPlatform === 'teams' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => setFilterPlatform('teams')}
          >
            🏢 Microsoft Teams
          </button>
          <button
            type="button"
            className={`btn ${filterPlatform === 'zoom' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => setFilterPlatform('zoom')}
          >
            📹 Zoom Workplace
          </button>
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn ${filterStatus === 'all' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setFilterStatus('all')}
          >
            All Status
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'ingested' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setFilterStatus('ingested')}
          >
            ⚪ No Draft (Ingested)
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'pending' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setFilterStatus('pending')}
          >
            🤖 AI Draft Ready
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'approved' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setFilterStatus('approved')}
          >
            ✅ Approved
          </button>
        </div>
      </div>

      {messages.length === 0 ? (
        <Empty
          icon={MessageSquare}
          title="No Chat Messages Found"
          description="Incoming messages from your Microsoft Teams and Zoom calls will appear here. Click 'Sync Teams & Zoom Messages' or simulate a test message above."
          action={
            <button className="btn btn-primary" style={{ fontWeight: 600 }} onClick={() => setIsSimulating(true)}>
              <Plus size={14} /> Ingest Test Chat Message
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m) => {
            const hasDraft = Boolean(m.twinDraftResponse && m.twinDraftResponse.trim().length > 0);
            const isEditing = editingId === m.id;
            const isGenerating = generateDraftMutation.isPending && (generateDraftMutation.variables as string) === m.id;

            return (
              <div
                key={m.id}
                className="card card-pad"
                style={{
                  borderLeft: m.platform === 'teams' ? '4px solid #2563eb' : '4px solid #0284c7',
                  background: '#ffffff',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${m.platform === 'teams' ? 'blue' : 'green'}`} style={{ fontWeight: 700 }}>
                      {m.platform === 'teams' ? '🏢 MS TEAMS' : '📹 ZOOM'}
                    </span>

                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
                      {m.senderName}
                    </span>

                    {m.senderEmail && (
                      <span style={{ fontSize: 11, color: '#6b7280' }}>
                        &lt;{m.senderEmail}&gt;
                      </span>
                    )}

                    <span className="badge" style={{ fontSize: 11 }}>
                      Chat / Topic: {m.chatId}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${m.status === 'approved' ? 'green' : hasDraft ? 'orange' : ''}`}>
                      {m.status === 'approved' ? '✅ Approved' : hasDraft ? '🤖 AI Draft Ready' : '⚪ Ingested (No Reply)'}
                    </span>

                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      {formatDate(m.createdAt)}
                    </span>

                    <button
                      type="button"
                      className="icon-button"
                      style={{ color: '#9ca3af', width: 22, height: 22 }}
                      onClick={() => deleteMutation.mutate(m.id)}
                      title="Dismiss / Delete Message"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Incoming Message Bubble */}
                <div
                  style={{
                    background: '#f9f8f6',
                    padding: '12px 16px',
                    borderRadius: 8,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: '#222',
                    border: '1px solid #e8e2d8',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#78716c', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Incoming Message:
                  </div>
                  {m.incomingMessage}
                </div>

                {/* Draft Reply Area */}
                {!hasDraft ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0eae1', paddingTop: 10 }}>
                    <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                      Cleanly ingested. No AI reply generated yet.
                    </span>

                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 12, fontWeight: 600 }}
                      disabled={isGenerating}
                      onClick={() => generateDraftMutation.mutate(m.id)}
                    >
                      <Sparkles size={13} className={isGenerating ? 'spin' : ''} />
                      {isGenerating ? 'Synthesizing SME Draft...' : 'Generate AI Draft Reply'}
                    </button>
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid #f0eae1', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#c65131' }}>
                        <Bot size={14} /> Deepak's AI Representative Draft:
                      </div>

                      {m.confidence && (
                        <span className="badge green" style={{ fontSize: 11 }}>
                          {Math.round(m.confidence * 100)}% Heuristics Confidence
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div style={{ marginBottom: 10 }}>
                        <textarea
                          className="input"
                          style={{ minHeight: 90, fontSize: 13, lineHeight: 1.45 }}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 12 }}
                            onClick={() => saveEditMutation.mutate({ id: m.id, text: editText })}
                          >
                            Save Changes
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ fontSize: 12 }}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          padding: '12px 14px',
                          borderRadius: 6,
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: '#166534',
                          marginBottom: 8,
                        }}
                      >
                        {m.twinDraftResponse}
                      </div>
                    )}

                    {m.reasoning && (
                      <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 10, fontStyle: 'italic' }}>
                        💡 {m.reasoning}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => {
                            setEditingId(m.id);
                            setEditText(m.twinDraftResponse);
                          }}
                        >
                          <Edit3 size={12} /> Edit Reply
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => copyToClipboard(m.id, m.twinDraftResponse)}
                        >
                          {copiedId === m.id ? (
                            <>
                              <CheckCircle2 size={12} color="#16a34a" /> Copied to Clipboard!
                            </>
                          ) : (
                            <>
                              <Copy size={12} /> Copy Reply
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={isGenerating}
                          onClick={() => generateDraftMutation.mutate(m.id)}
                          title="Re-generate using heuristics"
                        >
                          <RefreshCw size={12} className={isGenerating ? 'spin' : ''} /> Re-generate
                        </button>
                      </div>

                      <div>
                        {m.status !== 'approved' ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: 12, fontWeight: 700 }}
                            onClick={() => approveMutation.mutate(m.id)}
                          >
                            <CheckCircle2 size={13} /> Approve Draft
                          </button>
                        ) : (
                          <span className="badge green" style={{ padding: '6px 12px', fontSize: 12 }}>
                            ✓ Approved & Ready for Dispatch
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Simulate Incoming Message Modal */}
      {isSimulating && (
        <Modal
          title="Ingest / Simulate Incoming Chat Message"
          subtitle="Simulate an incoming technical query from Microsoft Teams or Zoom to verify selective AI drafting."
          onClose={() => setIsSimulating(false)}
        >
          <form onSubmit={handleSimulateSubmit}>
            <div className="field">
              <label className="label">Originating Platform</label>
              <select
                className="input"
                value={simPlatform}
                onChange={(e) => setSimPlatform(e.target.value as 'teams' | 'zoom')}
              >
                <option value="teams">🏢 Microsoft Teams (Chat / Channel Post)</option>
                <option value="zoom">📹 Zoom Workplace (In-Meeting / Team Chat)</option>
              </select>
            </div>

            <div className="field">
              <label className="label">Meeting / Channel Context Title</label>
              <input
                className="input"
                value={simChatId}
                onChange={(e) => setSimChatId(e.target.value)}
                placeholder="e.g. 5884-Alky Reactor Replacement Model Review"
                required
              />
            </div>

            <div className="grid-two" style={{ gap: 8 }}>
              <div className="field">
                <label className="label">Sender Name</label>
                <input
                  className="input"
                  value={simSenderName}
                  onChange={(e) => setSimSenderName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins (Process Lead)"
                  required
                />
              </div>

              <div className="field">
                <label className="label">Sender Email (Optional)</label>
                <input
                  className="input"
                  value={simSenderEmail}
                  onChange={(e) => setSimSenderEmail(e.target.value)}
                  placeholder="sarah.jenkins@kentplc.com"
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Incoming Chat Message Text</label>
              <textarea
                className="input"
                style={{ minHeight: 90 }}
                value={simMessage}
                onChange={(e) => setSimMessage(e.target.value)}
                placeholder="e.g. Deepak, what ASME rating is required for the high pressure wet sour gas line?"
                required
              />
            </div>

            <GoverningNote>
              Selective AI Reply: The message will be ingested cleanly without an automatic draft reply. You can then select it in the inbox and click 'Generate AI Draft Reply'.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsSimulating(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={ingestMutation.isPending}>
                {ingestMutation.isPending ? 'Ingesting…' : 'Ingest Clean Message'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

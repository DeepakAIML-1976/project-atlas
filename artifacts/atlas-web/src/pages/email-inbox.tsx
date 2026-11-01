import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Sparkles, RefreshCw, ShieldCheck, ArrowRight, Lock, Eye, EyeOff, CheckSquare, Square, Send, Search } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';
import { Link } from 'wouter';
import { getActiveOwnerEmail } from '@workspace/api-client-react';

interface EmailDraft {
  id: string;
  sender: string;
  subject: string;
  incomingBody: string;
  twinDraftResponse: string;
  reasoning?: string | null;
  confidence?: number | null;
  status: string;
  authorizedAt?: string | null;
  createdAt: string;
}

interface EmailDraftsData {
  emailDrafts: EmailDraft[];
}

interface SentEmail {
  id: string;
  recipient: string;
  subject: string;
  sentBody: string;
  sentAt?: string | null;
  createdAt: string;
}

interface SentEmailsData {
  sentEmails: SentEmail[];
}

interface LLMStatusData {
  isConfigured: boolean;
  provider: string;
  model: string;
}

function cleanDisplayBody(text?: string | null): string {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/(p|div|tr|li|h[1-6]|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
  }
  return text;
}

export function EmailInbox() {
  const queryClient = useQueryClient();
  const activeOwner = getActiveOwnerEmail();
  const [isIngesting, setIsIngesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authSinceDate, setAuthSinceDate] = useState('2026-10-18T00:00:00');
  const [autoDraftOnSync, setAutoDraftOnSync] = useState(false);
  const [manualAutoDraft, setManualAutoDraft] = useState(false);
  const [redraftingId, setRedraftingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<'all' | 'ingested' | 'pending' | 'authorized'>('all');
  const [mainTab, setMainTab] = useState<'inbox' | 'sent'>('inbox');
  const [sentSearchQuery, setSentSearchQuery] = useState('');

  // Ingest form state
  const [sender, setSender] = useState('John Engineering <john.doe@epc-contractor.com>');
  const [subject, setSubject] = useState('Piping Spec Clarification: Flange Rating for Separation Train');
  const [incomingBody, setIncomingBody] = useState('Hi Deepak,\n\nCould you please clarify the required ASME flange pressure rating and material grade for the 8-inch wet sour gas line downstream of the high pressure separator?\n\nThanks,\nJohn Doe');

  const emailsQuery = useQuery<EmailDraftsData>({
    queryKey: ['/api/atlas/email-drafts', activeOwner],
    queryFn: async () => {
      const res = await fetch('/api/atlas/email-drafts', {
        headers: { 'X-Owner-Email': activeOwner },
      });
      if (!res.ok) throw new Error('Failed to fetch email drafts');
      return res.json();
    },
  });

  const sentEmailsQuery = useQuery<SentEmailsData>({
    queryKey: ['/api/atlas/sent-emails', activeOwner],
    queryFn: async () => {
      const res = await fetch('/api/atlas/sent-emails', {
        headers: { 'X-Owner-Email': activeOwner },
      });
      if (!res.ok) throw new Error('Failed to fetch sent emails');
      return res.json();
    },
  });

  const llmQuery = useQuery<LLMStatusData>({
    queryKey: ['/api/atlas/llm/status'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/llm/status');
      if (!res.ok) throw new Error('Failed to fetch LLM status');
      return res.json();
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (payload: { sender: string; subject: string; incomingBody: string; generateDraft: boolean }) => {
      const res = await fetch('/api/atlas/email-drafts/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Owner-Email': activeOwner,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to ingest email');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
      setIsIngesting(false);
    },
  });

  const redraftAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/atlas/email-drafts/redraft-all', {
        method: 'POST',
        headers: { 'X-Owner-Email': activeOwner },
      });
      if (!res.ok) throw new Error('Failed to redraft pending emails');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
      alert(`Successfully regenerated ${data.count || 0} pending email draft(s) with AI Twin!`);
    },
    onError: (err: any) => {
      alert(`Error regenerating drafts: ${err.message}`);
    },
  });

  const redraftOneMutation = useMutation({
    mutationFn: async (id: string) => {
      setRedraftingId(id);
      const res = await fetch(`/api/atlas/email-drafts/${id}/redraft`, {
        method: 'POST',
        headers: { 'X-Owner-Email': activeOwner },
      });
      if (!res.ok) throw new Error('Failed to generate draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
    },
    onError: (err: any) => {
      alert(`Error generating draft: ${err.message}`);
    },
    onSettled: () => {
      setRedraftingId(null);
    },
  });

  const generateBatchMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/atlas/email-drafts/generate-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Owner-Email': activeOwner,
        },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to generate drafts for selected emails');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
      setSelectedIds(new Set());
      alert(`Successfully generated AI Twin drafts for ${data.count || 0} selected email(s)!`);
    },
    onError: (err: any) => {
      alert(`Batch Generation Error: ${err.message}`);
    },
  });

  if (emailsQuery.isLoading) return <Load count={4} />;
  if (emailsQuery.isError) return <ErrorState retry={() => emailsQuery.refetch()} />;

  const drafts = emailsQuery.data?.emailDrafts ?? [];
  const ingestedDrafts = drafts.filter((d) => d.status === 'ingested' || !d.twinDraftResponse);
  const pendingDrafts = drafts.filter((d) => d.status === 'pending_authorization' && Boolean(d.twinDraftResponse));
  const authorizedDrafts = drafts.filter((d) => d.status === 'authorized');

  const filteredDrafts = drafts.filter((d) => {
    if (activeFilter === 'ingested') return d.status === 'ingested' || !d.twinDraftResponse;
    if (activeFilter === 'pending') return d.status === 'pending_authorization' && Boolean(d.twinDraftResponse);
    if (activeFilter === 'authorized') return d.status === 'authorized';
    return true;
  });

  const sentEmails = sentEmailsQuery.data?.sentEmails ?? [];
  const filteredSentEmails = sentEmails.filter((s) => {
    if (!sentSearchQuery.trim()) return true;
    const query = sentSearchQuery.toLowerCase();
    return (
      (s.recipient && s.recipient.toLowerCase().includes(query)) ||
      (s.subject && s.subject.toLowerCase().includes(query)) ||
      (s.sentBody && s.sentBody.toLowerCase().includes(query))
    );
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredDrafts.length && filteredDrafts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDrafts.map((d) => d.id)));
    }
  };

  const handleIngestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ingestMutation.mutate({
      sender: sender.trim(),
      subject: subject.trim(),
      incomingBody: incomingBody.trim(),
      generateDraft: manualAutoDraft,
    });
  };

  const llmInfo = llmQuery.data;

  return (
    <>
      <PageHead
        eyebrow="COGNITIVE SUITE / EMAIL INGESTION & TWIN DRAFTS"
        title="Email Ingestion & Pre-Drafting"
        italic="replies drafted for you."
        description="Your AI Digital Twin reads incoming technical inquiries from your live Outlook desktop app, applies your 35-year Piping SME heuristics & DeepSeek intelligence, pre-drafts rigorous responses, and routes them to your Executive Authorization Inbox for sign-off."
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {pendingDrafts.length > 0 && (
              <button
                className="btn btn-outline"
                disabled={redraftAllMutation.isPending}
                onClick={() => redraftAllMutation.mutate()}
                title="Regenerate all pending drafts using your configured AI model (DeepSeek)"
              >
                <Sparkles size={15} /> {redraftAllMutation.isPending ? 'Regenerating…' : 'Regenerate Drafts with AI'}
              </button>
            )}
            <button
              className="btn btn-outline"
              disabled={isSyncing}
              onClick={() => {
                const activeEmail = (typeof window !== 'undefined' ? localStorage.getItem('atlas_active_owner_email') : null) || activeOwner || 'deepak.paranjape@kentplc.com';
                setAuthEmail(activeEmail);
                setIsAuthModalOpen(true);
              }}
              title="Authorize and ingest corporate mailbox emails for this workspace"
            >
              <Mail size={15} /> {isSyncing ? 'Syncing Inbox…' : 'Sync Live Outlook Inbox'}
            </button>
            <button className="btn btn-primary" onClick={() => setIsIngesting(true)}>
              <Plus size={15} /> Ingest Technical Query
            </button>
          </div>
        }
      />

      {/* Primary Navigation Switcher: Received Emails (Inbox) vs Email Sent */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '2px solid #e5dfd5', paddingBottom: 12 }}>
        <button
          className={`btn ${mainTab === 'inbox' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', fontWeight: 600, fontSize: 14 }}
          onClick={() => setMainTab('inbox')}
        >
          <Mail size={16} />
          Received Emails (Inbox)
          <span style={{
            background: mainTab === 'inbox' ? 'rgba(255,255,255,0.25)' : '#e5dfd5',
            color: mainTab === 'inbox' ? '#fff' : '#49454f',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11
          }}>
            {drafts.length}
          </span>
        </button>

        <button
          className={`btn ${mainTab === 'sent' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', fontWeight: 600, fontSize: 14 }}
          onClick={() => setMainTab('sent')}
        >
          <Send size={16} />
          Email Sent
          <span style={{
            background: mainTab === 'sent' ? 'rgba(255,255,255,0.25)' : '#e5dfd5',
            color: mainTab === 'sent' ? '#fff' : '#49454f',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11
          }}>
            {sentEmails.length}
          </span>
          <span style={{
            background: '#ecfdf5',
            color: '#059669',
            border: '1px solid #a7f3d0',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700
          }}>
            Context Tier 2
          </span>
        </button>
      </div>

      {mainTab === 'sent' ? (
        <div>
          {/* Informational Banner */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '14px 20px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Send size={20} color="#0284c7" />
              <div>
                <strong style={{ color: '#0f172a', fontSize: 14 }}>Outlook Sent Items (Context Verification Tier 2)</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#475569' }}>
                  These outgoing emails were sent by Deepak and ingested directly from Outlook desktop. The Context Verification Engine uses them as <strong>Tier 2 Context</strong> to ground future AI draft responses in Deepak&apos;s actual past decisions, commitments, clarifications, and engineering voice.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge green">Tier 2 Grounding Active</span>
              <span className="badge">{filteredSentEmails.length} Sent Emails</span>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ marginBottom: 20, position: 'relative' }}>
            <Search size={16} color="#64748b" style={{ position: 'absolute', left: 14, top: 12 }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: 38, width: '100%', fontSize: 13 }}
              placeholder="Search sent emails by recipient, subject, or message content..."
              value={sentSearchQuery}
              onChange={(e) => setSentSearchQuery(e.target.value)}
            />
          </div>

          {sentEmailsQuery.isLoading ? (
            <Load count={3} />
          ) : filteredSentEmails.length === 0 ? (
            <Empty
              icon={Send}
              title={sentEmails.length === 0 ? "No Sent Emails Ingested" : "No Matching Sent Emails"}
              description={
                sentEmails.length === 0
                  ? "Run daily sync or companion sync while Outlook is running to ingest your Sent Items for Context Verification."
                  : "Try clearing your search query to see all sent emails."
              }
              action={
                sentSearchQuery ? (
                  <button className="btn btn-outline" onClick={() => setSentSearchQuery('')}>
                    Clear Search
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredSentEmails.map((email) => (
                <div
                  key={email.id}
                  className="card"
                  style={{
                    padding: 18,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{email.subject}</h3>
                      <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                        <strong>To:</strong> {email.recipient}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge green" style={{ fontSize: 11 }}>
                        Grounding: Tier 2
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {formatDate(email.sentAt || email.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      padding: 12,
                      borderRadius: 6,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: '#334155',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 250,
                      overflowY: 'auto',
                    }}
                  >
                    {cleanDisplayBody(email.sentBody)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge green">Live Outlook Desktop Linked</span>
          {llmInfo?.isConfigured ? (
            <span className="badge green" title={`AI Provider: ${llmInfo.provider}, Model: ${llmInfo.model}`}>
              AI Engine: {llmInfo.provider.toUpperCase()} ({llmInfo.model})
            </span>
          ) : (
            <span className="badge orange" title="Add DEEPSEEK_API_KEY in .env to activate DeepSeek">
              AI Engine: Heuristic Rules (Add DEEPSEEK_API_KEY in .env)
            </span>
          )}
          <span className="badge">{drafts.length} Ingested Emails</span>
          {ingestedDrafts.length > 0 && <span className="badge blue">{ingestedDrafts.length} Needs AI Draft</span>}
          {pendingDrafts.length > 0 && <span className="badge orange">{pendingDrafts.length} Pending Authorization</span>}
        </div>
        <Link href="/authorization-inbox" className="btn btn-outline" style={{ fontSize: 13 }}>
          Open Executive Authorization Inbox <ShieldCheck size={14} />
        </Link>
      </div>

      {/* Filter Tabs & Selection Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e5dfd5', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setActiveFilter('all')}
          >
            All Emails ({drafts.length})
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'ingested' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setActiveFilter('ingested')}
          >
            Needs AI Draft ({ingestedDrafts.length})
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'pending' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setActiveFilter('pending')}
          >
            Pending Review ({pendingDrafts.length})
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'authorized' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setActiveFilter('authorized')}
          >
            Authorized & Sent ({authorizedDrafts.length})
          </button>
        </div>

        {filteredDrafts.length > 0 && (
          <button
            className="btn btn-outline"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={handleSelectAll}
          >
            {selectedIds.size === filteredDrafts.length ? (
              <>
                <CheckSquare size={13} /> Deselect All
              </>
            ) : (
              <>
                <Square size={13} /> Select All
              </>
            )}
          </button>
        )}
      </div>

      {/* Selected Action Bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: '12px 18px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckSquare size={18} color="#16a34a" />
            <strong style={{ color: '#166534' }}>{selectedIds.size} email(s) selected</strong>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-outline"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear Selection
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '6px 16px' }}
              disabled={generateBatchMutation.isPending}
              onClick={() => generateBatchMutation.mutate(Array.from(selectedIds))}
            >
              <Sparkles size={14} className={generateBatchMutation.isPending ? 'spin' : ''} />
              {generateBatchMutation.isPending
                ? `Generating ${selectedIds.size} AI Twin Draft(s)…`
                : `Generate AI Twin Drafts for Selected (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}

      {drafts.length === 0 ? (
        <Empty
          icon={Mail}
          title="No Ingested Emails"
          description="Sync your live Outlook inbox or simulate an incoming technical query to see how your digital twin pre-drafts replies using your engineering heuristics."
          action={
            <button className="btn btn-primary" onClick={() => setIsIngesting(true)}>
              <Plus size={14} /> Ingest Test Email
            </button>
          }
        />
      ) : filteredDrafts.length === 0 ? (
        <Empty
          icon={Mail}
          title={`No Emails in "${activeFilter.toUpperCase()}" view`}
          description="Switch to 'All Emails' or another category tab to view your communications."
          action={
            <button className="btn btn-outline" onClick={() => setActiveFilter('all')}>
              Show All Emails
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {filteredDrafts.map((draft) => {
            const isNoDraft = draft.status === 'ingested' || !draft.twinDraftResponse;
            const isSelected = selectedIds.has(draft.id);

            return (
              <div
                key={draft.id}
                className="card card-pad"
                style={{
                  borderLeft:
                    draft.status === 'authorized'
                      ? '4px solid #16a34a'
                      : isNoDraft
                      ? '4px solid #94a3b8'
                      : '4px solid #3b82f6',
                  backgroundColor: isSelected ? '#fafaf9' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(draft.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                      title="Select email for AI draft generation"
                    />
                    <span
                      className={`badge ${
                        draft.status === 'authorized'
                          ? 'green'
                          : draft.status === 'rejected'
                          ? 'red'
                          : isNoDraft
                          ? 'blue'
                          : 'orange'
                      }`}
                    >
                      {draft.status === 'authorized'
                        ? '✓ Authorized & Sent'
                        : draft.status === 'rejected'
                        ? 'Rejected'
                        : isNoDraft
                        ? '📥 Ingested (No AI Draft)'
                        : '⏳ Pending Sign-off'}
                    </span>
                    <span className="muted tiny">{formatDate(draft.createdAt)}</span>
                  </div>
                  {draft.confidence && (
                    <span className="badge">Twin Confidence: {Math.round(draft.confidence * 100)}%</span>
                  )}
                </div>

                <h3 style={{ fontSize: 18, margin: '0 0 4px', fontWeight: 600 }}>{draft.subject}</h3>
                <div className="muted tiny" style={{ marginBottom: 12 }}>From: {draft.sender}</div>

                <div style={{ background: '#f4f1eb', padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
                  <strong>Incoming Inquiry:</strong>
                  <p style={{ margin: '6px 0 0', color: '#4a4556', whiteSpace: 'pre-wrap' }}>{cleanDisplayBody(draft.incomingBody)}</p>
                </div>

                {isNoDraft ? (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      padding: '14px 18px',
                      borderRadius: 6,
                      fontSize: 13,
                      marginBottom: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569' }}>
                      <Sparkles size={16} color="#d97706" />
                      <span>
                        <strong>AI Draft Not Yet Generated.</strong> Select this email or generate an AI draft on demand when a response is required.
                      </span>
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 13 }}
                      disabled={redraftingId === draft.id}
                      onClick={() => redraftOneMutation.mutate(draft.id)}
                    >
                      <Sparkles size={13} className={redraftingId === draft.id ? 'spin' : ''} />
                      {redraftingId === draft.id ? 'Generating AI Draft…' : 'Generate AI Draft'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ background: '#fffdf9', border: '1px solid #e5dfd5', padding: '14px 18px', borderRadius: 6, fontSize: 14, marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c65131', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                        <Sparkles size={14} /> AI TWIN PROPOSED DRAFT RESPONSE:
                      </div>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{draft.twinDraftResponse}</p>
                      {draft.reasoning && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5dfd5', fontSize: 12, color: '#797480' }}>
                          <strong>SME Engineering Rationale:</strong> {draft.reasoning}
                        </div>
                      )}
                    </div>

                    {draft.status === 'pending_authorization' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: 13 }}
                          disabled={redraftingId === draft.id}
                          onClick={() => redraftOneMutation.mutate(draft.id)}
                          title="Regenerate this specific draft"
                        >
                          <RefreshCw size={13} className={redraftingId === draft.id ? 'spin' : ''} />
                          {redraftingId === draft.id ? 'Regenerating…' : 'Re-draft with AI'}
                        </button>
                        <Link href="/authorization-inbox" className="btn btn-primary" style={{ fontSize: 13 }}>
                          Review in Executive Inbox <ArrowRight size={14} />
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  )}

      {/* Ingest Simulation Modal */}
      {isIngesting && (
        <Modal
          title="Simulate Incoming Technical Email"
          subtitle="Test how your digital twin evaluates incoming technical inquiries and pre-drafts replies using your knowledge units."
          onClose={() => setIsIngesting(false)}
        >
          <form onSubmit={handleIngestSubmit}>
            <div className="field">
              <label className="label" htmlFor="s-sender">Sender Email & Name</label>
              <input
                id="s-sender"
                className="input"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="s-subject">Email Subject Line</label>
              <input
                id="s-subject"
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="s-body">Incoming Email Message Body</label>
              <textarea
                id="s-body"
                className="input"
                value={incomingBody}
                onChange={(e) => setIncomingBody(e.target.value)}
                style={{ minHeight: 120 }}
                required
              />
            </div>

            <div className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '14px 0' }}>
              <input
                id="manual-auto-draft"
                type="checkbox"
                checked={manualAutoDraft}
                onChange={(e) => setManualAutoDraft(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }}
              />
              <div>
                <label htmlFor="manual-auto-draft" style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Generate AI Twin draft immediately upon ingest
                </label>
                <span style={{ fontSize: 11, color: '#8b849c', display: 'block', marginTop: 2 }}>
                  When unchecked, the email is ingested without an automatic draft so you can generate it selectively on demand.
                </span>
              </div>
            </div>

            <GoverningNote>
              Your twin strictly analyzes inquiries according to your 35-year SME heuristics and project specifications.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsIngesting(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={ingestMutation.isPending}>
                {ingestMutation.isPending ? 'Ingesting…' : 'Ingest Email'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Mailbox Authentication & Ingestion Modal */}
      {isAuthModalOpen && (
        <Modal
          title="Authorize Corporate Mailbox Ingestion"
          subtitle={`Strictly ingests incoming emails for ${authEmail} into this workspace. Non-workspace accounts are barred.`}
          onClose={() => setIsAuthModalOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setIsSyncing(true);
                const res = await fetch('/api/atlas/integrations/outlook/sync', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Owner-Email': authEmail.trim().toLowerCase(),
                  },
                  body: JSON.stringify({
                    targetEmail: authEmail.trim().toLowerCase(),
                    email: authEmail.trim().toLowerCase(),
                    password: authPassword,
                    sinceDate: authSinceDate,
                    unreadOnly: false,
                    count: 50,
                    generateDraft: autoDraftOnSync,
                  }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                  alert(`Outlook Sync Notice:\n\n${data.error || 'Failed to sync with live Outlook.'}`);
                } else {
                  const scanned = data.scanned ?? data.count ?? 0;
                  const drafted = data.drafted ?? 0;
                  const ingested = data.ingested ?? (data.count !== undefined ? data.count : 0);
                  if (autoDraftOnSync) {
                    alert(`Outlook Sync Complete!\n\nScanned ${scanned} email(s) for ${authEmail}.\nIngested and generated ${drafted} new pending AI draft(s).`);
                  } else {
                    alert(`Outlook Sync Complete!\n\nScanned ${scanned} email(s) for ${authEmail}.\nIngested ${ingested} email(s) successfully into your inbox.\nYou can now select which emails require an AI drafted reply.`);
                  }
                  queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
                  setIsAuthModalOpen(false);
                }
              } catch (err: any) {
                alert(`Outlook Sync Error: ${err.message}`);
              } finally {
                setIsSyncing(false);
              }
            }}
          >
            <div className="field">
              <label className="label" htmlFor="auth-email">Workspace User Email ID</label>
              <input
                id="auth-email"
                className="input"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                readOnly
                style={{ opacity: 0.85, cursor: 'not-allowed' }}
              />
              <span style={{ fontSize: 11, color: '#dda280', marginTop: 4, display: 'block' }}>
                Strictly locked to active workspace owner ({authEmail}). Cross-tenant and secondary emails are barred.
              </span>
            </div>

            <div className="field">
              <label className="label" htmlFor="auth-password">Email Account Password / Credential</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-password"
                  className="input"
                  type={showAuthPassword ? 'text' : 'password'}
                  placeholder="Enter your email password to allow ingestion"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPassword(!showAuthPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#8b849c',
                    cursor: 'pointer',
                  }}
                >
                  {showAuthPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: 11, color: '#8b849c', marginTop: 4, display: 'block' }}>
                Credentials are encrypted with AES-256 and used to authenticate corporate mailbox access.
              </span>
            </div>

            <div className="field">
              <label className="label" htmlFor="auth-since">Ingest Emails Received Since</label>
              <input
                id="auth-since"
                className="input"
                type="text"
                value={authSinceDate}
                onChange={(e) => setAuthSinceDate(e.target.value)}
                placeholder="2026-10-18T00:00:00"
              />
              <span style={{ fontSize: 11, color: '#8b849c', marginTop: 4, display: 'block' }}>
                Defaults to 18th Oct 2026 to capture all recent engineering communications.
              </span>
            </div>

            <div className="field" style={{ margin: '14px 0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input
                id="auth-auto-draft"
                type="checkbox"
                checked={autoDraftOnSync}
                onChange={(e) => setAutoDraftOnSync(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }}
              />
              <div>
                <label htmlFor="auth-auto-draft" style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Automatically generate AI Twin drafts during sync
                </label>
                <span style={{ fontSize: 11, color: '#8b849c', display: 'block', marginTop: 2 }}>
                  When unchecked (default), emails are cleanly ingested first, allowing you to selectively choose which emails require an AI drafted reply.
                </span>
              </div>
            </div>

            <GoverningNote>
              Your digital twin strictly filters by your corporate email ID ({authEmail}). Emails from any other account or personal domain will be ignored.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsAuthModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSyncing}>
                <Lock size={14} /> {isSyncing ? 'Ingesting Mailbox…' : 'Authorize & Ingest Mailbox'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

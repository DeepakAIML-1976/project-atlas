import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Sparkles, RefreshCw, ShieldCheck, ArrowRight } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';
import { Link } from 'wouter';

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

import { getActiveOwnerEmail } from '@workspace/api-client-react';

export function EmailInbox() {
  const queryClient = useQueryClient();
  const activeOwner = getActiveOwnerEmail();
  const [isIngesting, setIsIngesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [redraftingId, setRedraftingId] = useState<string | null>(null);

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

  const llmQuery = useQuery<LLMStatusData>({
    queryKey: ['/api/atlas/llm/status'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/llm/status');
      if (!res.ok) throw new Error('Failed to fetch LLM status');
      return res.json();
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (payload: { sender: string; subject: string; incomingBody: string }) => {
      const res = await fetch('/api/atlas/email-drafts/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch('/api/atlas/email-drafts/redraft-all', { method: 'POST' });
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
      const res = await fetch(`/api/atlas/email-drafts/${id}/redraft`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to redraft email');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
    },
    onError: (err: any) => {
      alert(`Error regenerating draft: ${err.message}`);
    },
    onSettled: () => {
      setRedraftingId(null);
    },
  });

  if (emailsQuery.isLoading) return <Load count={4} />;
  if (emailsQuery.isError) return <ErrorState retry={() => emailsQuery.refetch()} />;

  const drafts = emailsQuery.data?.emailDrafts ?? [];
  const pendingCount = drafts.filter((d) => d.status === 'pending_authorization').length;
  const llmInfo = llmQuery.data;

  const handleIngestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ingestMutation.mutate({
      sender: sender.trim(),
      subject: subject.trim(),
      incomingBody: incomingBody.trim(),
    });
  };

  return (
    <>
      <PageHead
        eyebrow="COGNITIVE SUITE / EMAIL INGESTION & TWIN DRAFTS"
        title="Email Ingestion & Pre-Drafting"
        italic="replies drafted for you."
        description="Your AI Digital Twin reads incoming technical inquiries from your live Outlook desktop app, applies your 35-year Piping SME heuristics & DeepSeek intelligence, pre-drafts rigorous responses, and routes them to your Executive Authorization Inbox for sign-off."
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {pendingCount > 0 && (
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
              onClick={async () => {
                try {
                  setIsSyncing(true);
                  const res = await fetch('/api/atlas/integrations/outlook/sync', { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok || !data.success) {
                    alert(`Outlook Sync Notice:\n\n${data.error || 'Failed to sync with live Outlook.'}`);
                  } else {
                    const scanned = data.scanned ?? data.count ?? 0;
                    const drafted = data.drafted ?? (data.count !== undefined ? data.count : 0);
                    alert(`Outlook Sync Complete!\n\nScanned ${scanned} email(s) from Microsoft 365.\nCreated ${drafted} new pending AI draft(s).`);
                    queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
                  }
                } catch (err: any) {
                  alert(`Outlook Sync Error: ${err.message}`);
                } finally {
                  setIsSyncing(false);
                }
              }}
            >
              <Mail size={15} /> {isSyncing ? 'Syncing Inbox…' : 'Sync Live Outlook Inbox'}
            </button>
            <button className="btn btn-primary" onClick={() => setIsIngesting(true)}>
              <Plus size={15} /> Ingest Technical Query
            </button>
          </div>
        }
      />

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
          {pendingCount > 0 && <span className="badge orange">{pendingCount} Pending Authorization</span>}
        </div>
        <Link href="/authorization-inbox" className="btn btn-outline" style={{ fontSize: 13 }}>
          Open Executive Authorization Inbox <ShieldCheck size={14} />
        </Link>
      </div>

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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {drafts.map((draft) => (
            <div key={draft.id} className="card card-pad" style={{ borderLeft: draft.status === 'authorized' ? '4px solid #16a34a' : '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${draft.status === 'authorized' ? 'green' : draft.status === 'rejected' ? 'red' : 'orange'}`}>
                    {draft.status === 'authorized' ? '✓ Authorized & Sent' : draft.status === 'rejected' ? 'Rejected' : '⏳ Pending Sign-off'}
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
            </div>
          ))}
        </div>
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

            <GoverningNote>
              Your twin will match the query against your 35-year SME heuristics and create a pre-draft response for your 1-click review.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsIngesting(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={ingestMutation.isPending}>
                {ingestMutation.isPending ? 'Ingesting & Pre-Drafting…' : 'Ingest & Pre-Draft Response'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

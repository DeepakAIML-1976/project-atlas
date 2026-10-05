import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Sparkles, Send, ShieldCheck, CheckCircle2, XCircle, ArrowRight, MessageSquare, AlertCircle } from 'lucide-react';
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

export function EmailInbox() {
  const queryClient = useQueryClient();
  const [isIngesting, setIsIngesting] = useState(false);

  // Ingest form state
  const [sender, setSender] = useState('John Engineering <john.doe@epc-contractor.com>');
  const [subject, setSubject] = useState('Piping Spec Clarification: Flange Rating for Separation Train');
  const [incomingBody, setIncomingBody] = useState('Hi Deepak,\n\nCould you please clarify the required ASME flange pressure rating and material grade for the 8-inch wet sour gas line downstream of the high pressure separator?\n\nThanks,\nJohn Doe');

  const emailsQuery = useQuery<EmailDraftsData>({
    queryKey: ['/api/atlas/email-drafts'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/email-drafts');
      if (!res.ok) throw new Error('Failed to fetch email drafts');
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

  if (emailsQuery.isLoading) return <Load count={4} />;
  if (emailsQuery.isError) return <ErrorState retry={() => emailsQuery.refetch()} />;

  const drafts = emailsQuery.data?.emailDrafts ?? [];

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
        description="Your AI Digital Twin reads incoming technical inquiries from your live Outlook inbox via Microsoft Graph API, scans your 35-year Piping SME heuristics, pre-drafts rigorous response emails, and routes them to your Executive Authorization Inbox for sign-off."
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-outline"
              onClick={async () => {
                try {
                  const res = await fetch('/api/atlas/integrations/outlook/sync', { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok || !data.success) {
                    alert(`Live Outlook Sync Setup Required:\n\n${data.error || 'Configure Microsoft Graph API credentials in your .env file.'}\n\nKey: MS_GRAPH_ACCESS_TOKEN or MS_GRAPH_CLIENT_ID`);
                  } else {
                    alert(`Successfully synced ${data.count} live emails from Outlook Inbox!`);
                    queryClient.invalidateQueries({ queryKey: ['/api/atlas/email-drafts'] });
                  }
                } catch (err: any) {
                  alert(`Outlook Sync Error: ${err.message}`);
                }
              }}
            >
              <Mail size={15} /> Sync Live Outlook Inbox
            </button>
            <button className="btn btn-primary" onClick={() => setIsIngesting(true)}>
              <Plus size={15} /> Ingest Technical Query
            </button>
          </div>
        }
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="badge green">Live Outlook Webhook Ready</span>
          <span className="badge green">Consent-First Routing Active</span>
          <span className="badge">{drafts.length} Ingested Emails</span>
        </div>
        <Link href="/authorization-inbox" className="btn btn-outline" style={{ fontSize: 13 }}>
          Open Executive Authorization Inbox <ShieldCheck size={14} />
        </Link>
      </div>

      {drafts.length === 0 ? (
        <Empty
          icon={Mail}
          title="No Ingested Emails"
          description="Simulate an incoming technical query from a client, vendor, or contractor to see how your digital twin pre-drafts replies using your engineering heuristics."
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
                <p style={{ margin: '6px 0 0', color: '#4a4556', whiteSpace: 'pre-wrap' }}>{draft.incomingBody}</p>
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
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

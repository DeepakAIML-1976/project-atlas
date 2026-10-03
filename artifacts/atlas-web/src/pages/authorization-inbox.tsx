import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Edit3, XCircle, ShieldCheck, Sparkles, Mail, Video, AlertTriangle, Scale, ArrowRight, MessageSquareQuote } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';

interface EmailDraft {
  id: string;
  sender: string;
  subject: string;
  incomingBody: string;
  twinDraftResponse: string;
  reasoning?: string | null;
  confidence?: number | null;
  status: string;
  createdAt: string;
}

interface MeetingContribution {
  id: string;
  meetingId: string;
  topic: string;
  twinProposedStatement: string;
  engineeringBasis?: string | null;
  status: string;
  createdAt: string;
}

interface Decision {
  id: string;
  title: string;
  domain: string;
  context: string;
  recommendation: string;
  evidence: string[];
  confidence?: number | null;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
}

interface MeetingTrigger {
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

interface AuthorizationInboxData {
  pendingEmails: EmailDraft[];
  pendingMeetingContributions: MeetingContribution[];
  pendingDecisions: Decision[];
  pendingMeetingTriggers: MeetingTrigger[];
  totalPending: number;
}

interface LearnedKnowledgeUnit {
  id: string;
  domain: string;
  topic: string;
  heuristic?: string | null;
  reasoning?: string | null;
}

export function AuthorizationInbox() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'emails' | 'contributions' | 'decisions' | 'triggers'>('all');
  const [editingItem, setEditingItem] = useState<{ itemType: string; itemId: string; originalContent: string; contextTitle: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [rejectingItem, setRejectingItem] = useState<{ itemType: string; itemId: string; contextTitle: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [learnedNotification, setLearnedNotification] = useState<LearnedKnowledgeUnit | null>(null);

  const inboxQuery = useQuery<AuthorizationInboxData>({
    queryKey: ['/api/atlas/authorization-inbox'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/authorization-inbox');
      if (!res.ok) throw new Error('Failed to fetch authorization inbox');
      return res.json();
    },
  });

  const authorizeMutation = useMutation({
    mutationFn: async (payload: { itemType: string; itemId: string; action: 'authorize' | 'edit_authorize' | 'reject'; editedContent?: string; rejectionReason?: string }) => {
      const res = await fetch('/api/atlas/authorization-inbox/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Authorization action failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/authorization-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/overview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/knowledge-units'] });
      setEditingItem(null);
      setRejectingItem(null);
      setEditText('');
      setRejectReason('');

      if (data.learnedKnowledgeUnit) {
        setLearnedNotification(data.learnedKnowledgeUnit);
      }
    },
  });

  if (inboxQuery.isLoading) return <Load count={4} />;
  if (inboxQuery.isError) return <ErrorState retry={() => inboxQuery.refetch()} />;

  const data = inboxQuery.data;
  if (!data) return null;

  const handleAuthorize = (itemType: string, itemId: string) => {
    authorizeMutation.mutate({ itemType, itemId, action: 'authorize' });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    authorizeMutation.mutate({
      itemType: editingItem.itemType,
      itemId: editingItem.itemId,
      action: 'edit_authorize',
      editedContent: editText.trim(),
    });
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingItem) return;
    authorizeMutation.mutate({
      itemType: rejectingItem.itemType,
      itemId: rejectingItem.itemId,
      action: 'reject',
      rejectionReason: rejectReason.trim(),
    });
  };

  const total = data.totalPending;

  return (
    <>
      <PageHead
        eyebrow="EXECUTIVE GOVERNANCE / AUTHORIZATION INBOX"
        title="Executive Authorization Inbox"
        italic="1-click human sign-off."
        description="Your AI Digital Twin drafts responses, meeting contributions, and decisions. Every consequential output routes here for your explicit authorization, edit, or rejection."
        action={
          <div className="badge green">
            <ShieldCheck size={12} /> Consent-First Governance Active
          </div>
        }
      />

      {learnedNotification && (
        <div className="notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: 24 }}>
          <Sparkles size={18} color="#15803d" />
          <div>
            <strong>🧠 Digital Twin Learned from Your Correction!</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              Domain: <strong>{learnedNotification.domain}</strong> — Topic: <em>{learnedNotification.topic}</em>
            </p>
            {learnedNotification.heuristic && (
              <p style={{ margin: '4px 0 0', fontSize: 12, fontStyle: 'italic', background: '#dcfce7', padding: '6px 10px', borderRadius: 4 }}>
                Heuristic saved: "{learnedNotification.heuristic}"
              </p>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('all')}
        >
          All Pending ({total})
        </button>
        <button
          className={`btn ${activeTab === 'emails' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('emails')}
        >
          <Mail size={14} /> Email Drafts ({data.pendingEmails.length})
        </button>
        <button
          className={`btn ${activeTab === 'contributions' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('contributions')}
        >
          <MessageSquareQuote size={14} /> Meeting Statements ({data.pendingMeetingContributions.length})
        </button>
        <button
          className={`btn ${activeTab === 'decisions' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('decisions')}
        >
          <Scale size={14} /> Technical Decisions ({data.pendingDecisions.length})
        </button>
        <button
          className={`btn ${activeTab === 'triggers' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('triggers')}
        >
          <AlertTriangle size={14} /> Meeting Alerts ({data.pendingMeetingTriggers.length})
        </button>
      </div>

      {total === 0 ? (
        <Empty
          icon={ShieldCheck}
          title="Executive Inbox Clear"
          description="There are no pending actions requiring your authorization. All digital twin outputs have been authorized or reviewed."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Email Drafts */}
          {(activeTab === 'all' || activeTab === 'emails') &&
            data.pendingEmails.map((email) => (
              <div key={email.id} className="card card-pad" style={{ borderLeft: '4px solid #3b82f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge green"><Mail size={12} /> Email Response Draft</span>
                    <span className="muted tiny">{formatDate(email.createdAt)}</span>
                  </div>
                  {email.confidence && (
                    <span className="badge orange">Confidence: {Math.round(email.confidence * 100)}%</span>
                  )}
                </div>

                <h3 style={{ fontSize: 18, margin: '0 0 6px', fontWeight: 600 }}>{email.subject}</h3>
                <div className="muted tiny" style={{ marginBottom: 14 }}>From: {email.sender}</div>

                <div style={{ background: '#f4f1eb', padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
                  <strong>Incoming Message:</strong>
                  <p style={{ margin: '6px 0 0', color: '#4a4556', whiteSpace: 'pre-wrap' }}>{email.incomingBody}</p>
                </div>

                <div style={{ background: '#fffdf9', border: '1px solid #e5dfd5', padding: '14px 18px', borderRadius: 6, fontSize: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c65131', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                    <Sparkles size={14} /> AI TWIN PROPOSED DRAFT:
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{email.twinDraftResponse}</p>
                  {email.reasoning && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5dfd5', fontSize: 12, color: '#797480' }}>
                      <strong>Engineering Rationale:</strong> {email.reasoning}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-outline"
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => setRejectingItem({ itemType: 'email_draft', itemId: email.id, contextTitle: email.subject })}
                  >
                    <XCircle size={14} /> Reject & Train
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setEditingItem({ itemType: 'email_draft', itemId: email.id, originalContent: email.twinDraftResponse, contextTitle: email.subject });
                      setEditText(email.twinDraftResponse);
                    }}
                  >
                    <Edit3 size={14} /> Edit & Authorize
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={authorizeMutation.isPending}
                    onClick={() => handleAuthorize('email_draft', email.id)}
                  >
                    <Check size={14} /> Authorize As-Is
                  </button>
                </div>
              </div>
            ))}

          {/* Meeting Contributions */}
          {(activeTab === 'all' || activeTab === 'contributions') &&
            data.pendingMeetingContributions.map((contrib) => (
              <div key={contrib.id} className="card card-pad" style={{ borderLeft: '4px solid #8b5cf6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge green"><MessageSquareQuote size={12} /> Meeting Representative Statement</span>
                    <span className="muted tiny">{formatDate(contrib.createdAt)}</span>
                  </div>
                </div>

                <h3 style={{ fontSize: 18, margin: '0 0 10px', fontWeight: 600 }}>Topic: {contrib.topic}</h3>

                <div style={{ background: '#fffdf9', border: '1px solid #e5dfd5', padding: '14px 18px', borderRadius: 6, fontSize: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c65131', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                    <Sparkles size={14} /> PROPOSED STATEMENT FOR MEETING:
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>"{contrib.twinProposedStatement}"</p>
                  {contrib.engineeringBasis && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5dfd5', fontSize: 12, color: '#797480' }}>
                      <strong>Engineering Basis:</strong> {contrib.engineeringBasis}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-outline"
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => setRejectingItem({ itemType: 'meeting_contribution', itemId: contrib.id, contextTitle: contrib.topic })}
                  >
                    <XCircle size={14} /> Reject & Train
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setEditingItem({ itemType: 'meeting_contribution', itemId: contrib.id, originalContent: contrib.twinProposedStatement, contextTitle: contrib.topic });
                      setEditText(contrib.twinProposedStatement);
                    }}
                  >
                    <Edit3 size={14} /> Edit & Authorize
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={authorizeMutation.isPending}
                    onClick={() => handleAuthorize('meeting_contribution', contrib.id)}
                  >
                    <Check size={14} /> Authorize As-Is
                  </button>
                </div>
              </div>
            ))}

          {/* Decisions */}
          {(activeTab === 'all' || activeTab === 'decisions') &&
            data.pendingDecisions.map((dec) => (
              <div key={dec.id} className="card card-pad" style={{ borderLeft: '4px solid #f59e0b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge orange"><Scale size={12} /> Pending Decision</span>
                    <span className="badge">{dec.domain}</span>
                    <span className="muted tiny">{formatDate(dec.createdAt)}</span>
                  </div>
                </div>

                <h3 style={{ fontSize: 18, margin: '0 0 8px', fontWeight: 600 }}>{dec.title}</h3>
                <p style={{ fontSize: 13, color: '#4a4556', marginBottom: 12 }}>{dec.context}</p>

                <div style={{ background: '#fffdf9', border: '1px solid #e5dfd5', padding: '14px 18px', borderRadius: 6, fontSize: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c65131', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                    <Sparkles size={14} /> TWIN RECOMMENDED DECISION:
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{dec.recommendation}</p>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-outline"
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => setRejectingItem({ itemType: 'decision', itemId: dec.id, contextTitle: dec.title })}
                  >
                    <XCircle size={14} /> Reject & Train
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setEditingItem({ itemType: 'decision', itemId: dec.id, originalContent: dec.recommendation, contextTitle: dec.title });
                      setEditText(dec.recommendation);
                    }}
                  >
                    <Edit3 size={14} /> Edit & Approve
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={authorizeMutation.isPending}
                    onClick={() => handleAuthorize('decision', dec.id)}
                  >
                    <Check size={14} /> Approve As-Is
                  </button>
                </div>
              </div>
            ))}

          {/* Meeting Triggers */}
          {(activeTab === 'all' || activeTab === 'triggers') &&
            data.pendingMeetingTriggers.map((trig) => (
              <div key={trig.id} className="card card-pad" style={{ borderLeft: '4px solid #ef4444' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge red"><AlertTriangle size={12} /> Meeting Name Trigger Alert</span>
                    <span className="muted tiny">{formatDate(trig.createdAt)}</span>
                  </div>
                </div>

                <h3 style={{ fontSize: 16, margin: '0 0 6px', fontWeight: 600 }}>Speaker: {trig.speakerName || 'Meeting Participant'}</h3>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                  <strong>Trigger Question Asked:</strong> "{trig.questionAsked}"
                </div>

                <div style={{ background: '#fffdf9', border: '1px solid #e5dfd5', padding: '14px 18px', borderRadius: 6, fontSize: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c65131', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                    <Sparkles size={14} /> PROPOSED BOT RESPONSE:
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{trig.twinProposedResponse}</p>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-outline"
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => setRejectingItem({ itemType: 'meeting_trigger', itemId: trig.id, contextTitle: trig.questionAsked })}
                  >
                    <XCircle size={14} /> Dismiss & Train
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setEditingItem({ itemType: 'meeting_trigger', itemId: trig.id, originalContent: trig.twinProposedResponse, contextTitle: trig.questionAsked });
                      setEditText(trig.twinProposedResponse);
                    }}
                  >
                    <Edit3 size={14} /> Edit & Send
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={authorizeMutation.isPending}
                    onClick={() => handleAuthorize('meeting_trigger', trig.id)}
                  >
                    <Check size={14} /> Authorize Response
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Edit & Authorize Modal */}
      {editingItem && (
        <Modal
          title={`Edit & Authorize: ${editingItem.contextTitle}`}
          subtitle="Your correction will be sent and automatically used to distill a new Tacit Knowledge Unit for your twin."
          onClose={() => setEditingItem(null)}
        >
          <form onSubmit={handleEditSubmit}>
            <div className="field">
              <label className="label">Original Twin Proposed Text</label>
              <div style={{ background: '#f4f1eb', padding: 10, borderRadius: 6, fontSize: 12, color: '#666', marginBottom: 14 }}>
                {editingItem.originalContent}
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="edit-text">Your Authoritative Correction / Edits</label>
              <textarea
                id="edit-text"
                className="input"
                style={{ minHeight: 160 }}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                required
              />
            </div>

            <GoverningNote>
              Saving this edit establishes your true preference and trains your AI twin on this engineering domain.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEditingItem(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={authorizeMutation.isPending}>
                {authorizeMutation.isPending ? 'Authorizing & Learning…' : 'Authorize & Train Twin'} <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectingItem && (
        <Modal
          title={`Reject Draft: ${rejectingItem.contextTitle}`}
          subtitle="Explain why this proposed action was rejected so your twin learns not to make this mistake again."
          onClose={() => setRejectingItem(null)}
        >
          <form onSubmit={handleRejectSubmit}>
            <div className="field">
              <label className="label" htmlFor="reject-reason">Rejection Rationale / Engineering Rule</label>
              <textarea
                id="reject-reason"
                className="input"
                style={{ minHeight: 140 }}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Reject because standard carbon steel cannot be specified for wet sour gas without NACE MR0175 NDT certification."
                required
              />
            </div>

            <GoverningNote>
              Your feedback will be extracted into a Tacit Knowledge Unit so your twin avoids similar proposals in the future.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setRejectingItem(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={authorizeMutation.isPending}>
                {authorizeMutation.isPending ? 'Rejecting…' : 'Reject & Record Heuristic'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

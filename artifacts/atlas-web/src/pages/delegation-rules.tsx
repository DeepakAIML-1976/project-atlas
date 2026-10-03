import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Trash2, CheckCircle2, AlertOctagon, Sliders, ShieldCheck, Lock } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';

interface DelegationRule {
  id: string;
  domain: string;
  category: string;
  maxRiskLevel: string;
  requiresHumanApproval: boolean;
  autoExecutionEnabled: boolean;
  createdAt: string;
}

interface DelegationRulesData {
  delegationRules: DelegationRule[];
}

export function DelegationRules() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [domain, setDomain] = useState('Piping Engineering');
  const [category, setCategory] = useState('Technical Material Query');
  const [maxRiskLevel, setMaxRiskLevel] = useState<'low' | 'medium' | 'high'>('low');
  const [requiresHumanApproval, setRequiresHumanApproval] = useState(true);
  const [autoExecutionEnabled, setAutoExecutionEnabled] = useState(false);

  const rulesQuery = useQuery<DelegationRulesData>({
    queryKey: ['/api/atlas/delegation-rules'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/delegation-rules');
      if (!res.ok) throw new Error('Failed to fetch delegation rules');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { domain: string; category: string; maxRiskLevel: 'low' | 'medium' | 'high'; requiresHumanApproval: boolean; autoExecutionEnabled: boolean }) => {
      const res = await fetch('/api/atlas/delegation-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create delegation rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/delegation-rules'] });
      setIsAdding(false);
      setCategory('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/atlas/delegation-rules/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete delegation rule');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/delegation-rules'] });
    },
  });

  if (rulesQuery.isLoading) return <Load count={4} />;
  if (rulesQuery.isError) return <ErrorState retry={() => rulesQuery.refetch()} />;

  const rules = rulesQuery.data?.delegationRules ?? [];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      domain,
      category: category.trim(),
      maxRiskLevel,
      requiresHumanApproval,
      autoExecutionEnabled,
    });
  };

  return (
    <>
      <PageHead
        eyebrow="GOVERNANCE SUITE / DELEGATION RULES & RISK BOUNDARIES"
        title="Delegation Rules & Autonomy Limits"
        italic="boundaries first."
        description="Define explicit risk thresholds, approval policies, and execution boundaries for your AI Digital Twin across engineering domains."
        action={
          <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
            <Plus size={15} /> Add Delegation Rule
          </button>
        }
      />

      <div style={{ background: '#292538', color: '#f8f2e7', padding: '24px 30px', borderRadius: 10, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <ShieldCheck size={22} color="#e5a483" />
          <h2 style={{ fontSize: 20, margin: 0, color: '#f8f2e7', fontWeight: 600 }}>Default Executive Safety Ceiling</h2>
        </div>
        <p style={{ color: '#bdb5c8', fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 700 }}>
          By default, all consequential technical decisions, material approvals, and external emails require <strong>explicit human sign-off</strong> in your Executive Authorization Inbox. Low-risk queries may be configured for automated processing only when confidence exceeds 95%.
        </p>
      </div>

      {rules.length === 0 ? (
        <Empty
          icon={Shield}
          title="No Delegation Rules Configured"
          description="Default safety policy applies to all domains. Add custom domain delegation rules to specify risk thresholds and approval limits."
          action={
            <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
              <Plus size={14} /> Add First Delegation Rule
            </button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
          {rules.map((rule) => (
            <div key={rule.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span className="badge green">{rule.domain}</span>
                  <span className={`badge ${rule.maxRiskLevel === 'low' ? 'green' : rule.maxRiskLevel === 'medium' ? 'orange' : 'red'}`}>
                    Max Risk: {rule.maxRiskLevel.toUpperCase()}
                  </span>
                </div>

                <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 10px' }}>{rule.category}</h3>

                <div style={{ background: '#f4f1eb', padding: '12px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Lock size={14} color={rule.requiresHumanApproval ? '#c65131' : '#16a34a'} />
                    <span>Human Approval: <strong>{rule.requiresHumanApproval ? 'Mandatory Sign-off' : 'Delegated'}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sliders size={14} color={rule.autoExecutionEnabled ? '#16a34a' : '#6b7280'} />
                    <span>Auto Execution: <strong>{rule.autoExecutionEnabled ? 'Enabled for Low-Risk (>95% confidence)' : 'Disabled'}</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #ded9d2', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted tiny">Created {formatDate(rule.createdAt)}</span>
                <button
                  className="icon-button"
                  style={{ color: '#dc2626' }}
                  onClick={() => {
                    if (window.confirm('Delete this delegation rule?')) {
                      deleteMutation.mutate(rule.id);
                    }
                  }}
                  title="Delete rule"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Rule Modal */}
      {isAdding && (
        <Modal
          title="Add Domain Delegation Rule"
          subtitle="Set risk limits and human approval requirements for a specific technical domain."
          onClose={() => setIsAdding(false)}
        >
          <form onSubmit={handleCreateSubmit}>
            <div className="field">
              <label className="label">Domain</label>
              <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="Piping Engineering">Piping Engineering</option>
                <option value="Materials & Integrity">Materials & Integrity</option>
                <option value="Project Governance">Project Governance</option>
                <option value="Safety & Compliance">Safety & Compliance</option>
                <option value="Vendor Specifications">Vendor Specifications</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="cat">Rule Category / Sub-topic</label>
              <input
                id="cat"
                className="input"
                placeholder="e.g. Standard Flange & Valve Data Sheet Clarifications"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label">Maximum Permitted Risk Level</label>
              <select className="input" value={maxRiskLevel} onChange={(e) => setMaxRiskLevel(e.target.value as 'low' | 'medium' | 'high')}>
                <option value="low">Low Risk (Standard technical Q&A / data sheets)</option>
                <option value="medium">Medium Risk (Design changes / vendor deviations)</option>
                <option value="high">High Risk (Safety critical / hydrotest pressures)</option>
              </select>
            </div>

            <div className="field">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={requiresHumanApproval}
                  onChange={(e) => setRequiresHumanApproval(e.target.checked)}
                />
                <span>Mandatory Human Executive Approval (Routes all output to Executive Inbox)</span>
              </label>
            </div>

            <div className="field">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={autoExecutionEnabled}
                  onChange={(e) => setAutoExecutionEnabled(e.target.checked)}
                />
                <span>Enable Auto-Execution for Low-Risk ({'>'}95% Twin Confidence)</span>
              </label>
            </div>

            <GoverningNote>
              Consequential safety and structural piping decisions remain subject to mandatory human sign-off regardless of settings.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsAdding(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving Rule…' : 'Save Delegation Rule'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

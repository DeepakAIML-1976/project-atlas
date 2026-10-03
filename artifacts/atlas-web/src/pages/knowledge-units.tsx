import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Plus, Search, Trash2, Sparkles, BookOpen, ShieldCheck, CheckCircle2, Filter } from 'lucide-react';
import { Empty, ErrorState, GoverningNote, Load, Modal, PageHead, formatDate } from '@/components/atlas-ui';

interface KnowledgeUnit {
  id: string;
  domain: string;
  topic: string;
  problem?: string | null;
  context?: string | null;
  experience?: string | null;
  reasoning?: string | null;
  decision?: string | null;
  outcome?: string | null;
  lesson?: string | null;
  heuristic?: string | null;
  exception?: string | null;
  confidence: number;
  validationStatus: string;
  createdAt: string;
}

interface KnowledgeUnitsData {
  knowledgeUnits: KnowledgeUnit[];
}

export function KnowledgeUnits() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Form state for manual teach
  const [domain, setDomain] = useState('Piping Engineering');
  const [topic, setTopic] = useState('');
  const [problem, setProblem] = useState('');
  const [heuristic, setHeuristic] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [lesson, setLesson] = useState('');

  const kuQuery = useQuery<KnowledgeUnitsData>({
    queryKey: ['/api/atlas/knowledge-units', selectedDomain, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedDomain !== 'all') params.append('domain', selectedDomain);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());

      const res = await fetch(`/api/atlas/knowledge-units?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch knowledge units');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { domain: string; topic: string; problem?: string; heuristic?: string; reasoning?: string; lesson?: string }) => {
      const res = await fetch('/api/atlas/knowledge-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to add knowledge unit');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/knowledge-units'] });
      setIsAdding(false);
      setTopic('');
      setProblem('');
      setHeuristic('');
      setReasoning('');
      setLesson('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/atlas/knowledge-units/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete knowledge unit');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/atlas/knowledge-units'] });
    },
  });

  if (kuQuery.isLoading) return <Load count={4} />;
  if (kuQuery.isError) return <ErrorState retry={() => kuQuery.refetch()} />;

  const units = kuQuery.data?.knowledgeUnits ?? [];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      domain,
      topic: topic.trim(),
      problem: problem.trim() || undefined,
      heuristic: heuristic.trim() || undefined,
      reasoning: reasoning.trim() || undefined,
      lesson: lesson.trim() || undefined,
    });
  };

  const domains = ['all', 'Piping Engineering', 'Materials & Integrity', 'Project Governance', 'Safety & Compliance', 'Engineering Heuristics'];

  return (
    <>
      <PageHead
        eyebrow="COGNITIVE SUITE / HEURISTICS & TACIT KNOWLEDGE HUB"
        title="Tacit Knowledge & Engineering Heuristics"
        italic="how you think."
        description="The repository of 35-year Piping Engineering SME experience, heuristics, and reasoning patterns. Learns automatically from your executive inbox corrections or explicit direct instruction."
        action={
          <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
            <Plus size={15} /> Teach Twin Heuristic
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#797480' }} />
          <input
            className="input"
            style={{ paddingLeft: 38 }}
            placeholder="Search heuristics, topics, or reasoning..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#797480" />
          {domains.map((d) => (
            <button
              key={d}
              className={`btn ${selectedDomain === d ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setSelectedDomain(d)}
            >
              {d === 'all' ? 'All Domains' : d}
            </button>
          ))}
        </div>
      </div>

      {units.length === 0 ? (
        <Empty
          icon={Brain}
          title="No Knowledge Units Found"
          description="Your digital twin hasn't recorded heuristics for this selection yet. Teach your twin directly or edit drafts in the Executive Authorization Inbox to build SME knowledge."
          action={
            <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
              <Plus size={14} /> Add First Engineering Heuristic
            </button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
          {units.map((unit) => (
            <div key={unit.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className="badge green">{unit.domain}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={13} color="#16a34a" />
                    <span className="muted tiny">Validated ({Math.round(unit.confidence * 100)}%)</span>
                  </div>
                </div>

                <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 8px', color: '#292538' }}>{unit.topic}</h3>

                {unit.heuristic && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#78350f', padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
                    <strong>Rule / Heuristic:</strong> "{unit.heuristic}"
                  </div>
                )}

                {unit.problem && (
                  <p style={{ fontSize: 13, color: '#4a4556', marginBottom: 10 }}>
                    <strong>Problem/Context:</strong> {unit.problem}
                  </p>
                )}

                {unit.reasoning && (
                  <p style={{ fontSize: 13, color: '#4a4556', marginBottom: 10 }}>
                    <strong>SME Rationale:</strong> {unit.reasoning}
                  </p>
                )}

                {unit.lesson && (
                  <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginBottom: 10 }}>
                    💡 <em>Lesson: {unit.lesson}</em>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #ded9d2', paddingTop: 12, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted tiny">{formatDate(unit.createdAt)}</span>
                <button
                  className="icon-button"
                  style={{ color: '#dc2626' }}
                  onClick={() => {
                    if (window.confirm('Delete this knowledge unit?')) {
                      deleteMutation.mutate(unit.id);
                    }
                  }}
                  title="Delete knowledge unit"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Teach Modal */}
      {isAdding && (
        <Modal
          title="Teach Twin Engineering Heuristic"
          subtitle="Directly codify tacit engineering knowledge, safety rules, or material preferences."
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
                <option value="Engineering Heuristics">Engineering Heuristics</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="topic">Topic / Sub-system</label>
              <input
                id="topic"
                className="input"
                placeholder="e.g. Pump Discharge Piping Vibration & Flange Ratings"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="heuristic">Rule / Heuristic (The "Golden Rule")</label>
              <textarea
                id="heuristic"
                className="input"
                placeholder="e.g. Always specify Class 300 flanges and gusseted small-bore connections on high-vibration pump discharges."
                value={heuristic}
                onChange={(e) => setHeuristic(e.target.value)}
                style={{ minHeight: 80 }}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="reasoning">Engineering Rationale & Context</label>
              <textarea
                id="reasoning"
                className="input"
                placeholder="e.g. Fatigue failures occurring at weld-o-lets due to acoustic/flow induced vibration over 15 years operational experience."
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                style={{ minHeight: 80 }}
              />
            </div>

            <GoverningNote>
              This rule will be integrated directly into your digital twin's reasoning core for future email drafts and meeting contributions.
            </GoverningNote>

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setIsAdding(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving Heuristic…' : 'Save Heuristic to Twin Core'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

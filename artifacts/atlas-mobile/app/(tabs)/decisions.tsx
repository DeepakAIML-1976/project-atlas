import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateAtlasDecision, useGetAtlasDecisions, useReviewAtlasDecision } from '@workspace/api-client-react';
import { Action, Body, Card, Empty, ErrorState, Field, InlineError, Loading, Page, Section, Status } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

export default function DecisionsScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const decisions = useGetAtlasDecisions();
  const createDecision = useCreateAtlasDecision();
  const reviewDecision = useReviewAtlasDecision();
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('');
  const [context, setContext] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const refresh = () => { void decisions.refetch(); };

  const propose = async () => {
    setError('');
    try {
      await createDecision.mutateAsync({
        data: {
          title: title.trim(),
          domain: domain.trim(),
          context: context.trim(),
          recommendation: recommendation.trim(),
          evidence: evidence.split('\n').map((item) => item.trim()).filter(Boolean),
          confidence: null,
        },
      });
      setTitle('');
      setDomain('');
      setContext('');
      setRecommendation('');
      setEvidence('');
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The proposal could not be recorded.');
    }
  };
  const review = async (decisionId: string, status: 'approved' | 'rejected' | 'escalated') => {
    setError('');
    try {
      await reviewDecision.mutateAsync({ decisionId, data: { status, reviewNote: reviewNotes[decisionId]?.trim() ?? '' } });
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The review could not be saved.');
    }
  };

  if (decisions.isLoading) return <Page title="Decisions"><Loading /></Page>;
  if (decisions.isError) return <Page title="Decisions"><ErrorState message={decisions.error.message} retry={refresh} /></Page>;
  if (!decisions.data) return <Page title="Decisions"><Loading /></Page>;

  return (
    <Page title="Decisions" eyebrow="Advice is never action" onRefresh={refresh}>
      <Body>Capture a proposal and its evidence. A person must make every decision explicitly; Atlas never approves or acts on a recommendation automatically.</Body>
      <Card>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>Record a proposal</Text>
        <Field label="Decision" value={title} onChangeText={setTitle} placeholder="What needs a decision?" maxLength={240} />
        <Field label="Domain" value={domain} onChangeText={setDomain} placeholder="The area this affects" maxLength={120} />
        <Field label="Context" value={context} onChangeText={setContext} placeholder="Relevant background and constraints" multiline maxLength={6000} />
        <Field label="Recommendation" value={recommendation} onChangeText={setRecommendation} placeholder="A proposal for human review" multiline maxLength={3000} />
        <Field label="Evidence (one item per line)" value={evidence} onChangeText={setEvidence} placeholder="Link or describe supporting evidence" multiline />
        {error ? <InlineError message={error} /> : null}
        <Action label={createDecision.isPending ? 'Recording…' : 'Record for review'} icon="plus" onPress={propose} disabled={createDecision.isPending || !title.trim() || !domain.trim() || !context.trim() || !recommendation.trim()} />
      </Card>

      <Section title="Decision record">
        {decisions.data.length === 0 ? (
          <Empty icon="check-circle" title="No decisions recorded" detail="Proposals you add will be listed here for a human to review." />
        ) : decisions.data.map((decision) => (
          <Card key={decision.id}>
            <View style={styles.row}>
              <Text style={[styles.decisionTitle, { color: colors.foreground }]}>{decision.title}</Text>
              <Status>{decision.status}</Status>
            </View>
            <Body>{decision.domain} · {new Date(decision.createdAt).toLocaleDateString()}</Body>
            <View style={[styles.divider, { borderTopColor: colors.border }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Context</Text>
            <Body>{decision.context}</Body>
            <Text style={[styles.label, { color: colors.foreground }]}>Recommendation</Text>
            <Body>{decision.recommendation}</Body>
            <Text style={[styles.label, { color: colors.foreground }]}>Evidence</Text>
            {decision.evidence.length ? decision.evidence.map((item, index) => <Body key={`${decision.id}-${index}`}>{item}</Body>) : <Body>No evidence was attached.</Body>}
            {decision.confidence !== null ? <Body>Recorded confidence: {Math.round(decision.confidence * 100)}%</Body> : null}
            {decision.status === 'pending' ? (
              <>
                <Field label="Your review note (optional)" value={reviewNotes[decision.id] ?? ''} onChangeText={(value) => setReviewNotes((current) => ({ ...current, [decision.id]: value }))} placeholder="Record why you chose this outcome" multiline maxLength={3000} />
                <View style={styles.reviewActions}>
                  <Action compact label="Approve" icon="check" disabled={reviewDecision.isPending} onPress={() => { void review(decision.id, 'approved'); }} />
                  <Action compact secondary label="Reject" icon="x" disabled={reviewDecision.isPending} onPress={() => { void review(decision.id, 'rejected'); }} />
                  <Action compact secondary label="Escalate" icon="arrow-up-right" disabled={reviewDecision.isPending} onPress={() => { void review(decision.id, 'escalated'); }} />
                </View>
              </>
            ) : (
              <Card style={{ backgroundColor: colors.muted }}>
                <Text style={{ color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 13 }}>Human review · {decision.status}</Text>
                <Body>{decision.reviewNote || 'No review note was recorded.'}</Body>
              </Card>
            )}
            {error ? <InlineError message={error} /> : null}
          </Card>
        ))}
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 25 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', alignItems: 'flex-start' },
  decisionTitle: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 16 },
  divider: { borderTopWidth: 1, marginVertical: 3 },
  label: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  reviewActions: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
});
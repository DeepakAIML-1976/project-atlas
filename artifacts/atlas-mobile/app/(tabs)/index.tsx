import React, { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useClerk } from '@clerk/expo';
import { useCreateAtlasWorkspace, useGetAtlasOverview, useGetAtlasSession } from '@workspace/api-client-react';
import { Action, Body, Card, Empty, ErrorState, Field, InlineError, Loading, Page, Section, Status } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

const spaces = [
  { key: 'twins', label: 'People' },
  { key: 'sources', label: 'Sources' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'pendingDecisions', label: 'Decisions to review' },
  { key: 'actions', label: 'Open actions' },
  { key: 'knowledgeLinks', label: 'Connections' },
] as const;

export default function OverviewScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const session = useGetAtlasSession();
  const overview = useGetAtlasOverview({ query: { enabled: !!session.data?.workspace, queryKey: ['/api/atlas/overview'] } });
  const createWorkspace = useCreateAtlasWorkspace();
  const [workspaceName, setWorkspaceName] = useState('');
  const [industry, setIndustry] = useState('');
  const [formError, setFormError] = useState('');
  const [accountError, setAccountError] = useState('');
  const exit = async () => {
    setAccountError('');
    try {
      await signOut();
      queryClient.clear();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Sign out could not be completed.');
    }
  };

  const create = async () => {
    setFormError('');
    try {
      await createWorkspace.mutateAsync({ data: { name: workspaceName.trim(), industry: industry.trim() } });
      await queryClient.invalidateQueries();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Workspace could not be created. Try again.');
    }
  };

  if (session.isLoading) return <Page title="Your workspace"><Loading /></Page>;
  if (session.isError) return <Page title="Your workspace"><ErrorState message={session.error.message} retry={() => { void session.refetch(); }} /></Page>;
  if (!session.data?.workspace) {
    return (
      <Page title="Start with your workspace" eyebrow="A space for shared context">
        <Body>Atlas begins with the people and work you choose to bring in. Create a workspace to get started.</Body>
        <Card>
          <Field label="Workspace name" value={workspaceName} onChangeText={setWorkspaceName} placeholder="e.g. Northstar Studio" maxLength={120} />
          <Field label="Industry" value={industry} onChangeText={setIndustry} placeholder="e.g. Design & technology" maxLength={100} />
          {formError ? <InlineError message={formError} /> : null}
          <Action label={createWorkspace.isPending ? 'Creating…' : 'Create workspace'} icon="arrow-right" onPress={create} disabled={createWorkspace.isPending || !workspaceName.trim() || !industry.trim()} />
        </Card>
        <Card style={{ backgroundColor: colors.accent }}>
          <Text style={[styles.promiseTitle, { color: colors.foreground }]}>Nothing is assumed.</Text>
          <Body style={{ color: colors.foreground }}>Your team’s sources and decisions appear only when you add them. Human review remains part of every consequential action.</Body>
        </Card>
        {accountError ? <InlineError message={accountError} /> : null}
        <Action label="Sign out" icon="log-out" secondary onPress={() => { void exit(); }} />
      </Page>
    );
  }

  if (overview.isLoading) return <Page title="Overview"><Loading /></Page>;
  if (overview.isError) return <Page title="Overview"><ErrorState message={overview.error.message} retry={() => { void overview.refetch(); }} /></Page>;
  const data = overview.data;
  if (!data) return <Page title="Overview"><Loading /></Page>;
  return (
    <Page title={data.workspace.name} eyebrow={`${data.workspace.industry} · Workspace overview`} onRefresh={() => { void overview.refetch(); }}>
      <Card style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={[styles.serif, { color: colors.foreground }]}>Context, built by you.</Text>
            <Body style={{ color: colors.foreground }}>Your Atlas takes shape from reviewed, user-provided information.</Body>
          </View>
          <View style={[styles.progressRing, { borderColor: colors.primary }]}>
            <Text style={[styles.progressValue, { color: colors.foreground }]}>{data.profileCompletion}%</Text>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>TWIN</Text>
          </View>
        </View>
        <Link href="/(tabs)/twin" asChild>
          <Pressable accessibilityRole="button" style={[styles.inlineLink, { borderTopColor: colors.border }]}>
            <Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold', fontSize: 13 }}>Review your twin profile</Text>
            <Text style={{ color: colors.primary, fontSize: 19 }}>›</Text>
          </Pressable>
        </Link>
      </Card>

      <Section title="Workspace at a glance">
        <View style={styles.metrics}>
          {spaces.map(({ key, label }) => (
            <Card key={key} style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{data.counts[key]}</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
            </Card>
          ))}
        </View>
      </Section>

      <Section title="A thoughtful next step">
        {data.setupNeeds.length ? data.setupNeeds.map((item, index) => (
          <Card key={`${item}-${index}`} style={styles.setupRow}>
            <Status>TO DO</Status>
            <Text style={{ color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 14, flex: 1 }}>{item}</Text>
          </Card>
        )) : (
          <Empty icon="check-circle" title="Your foundations are in place" detail="There are no setup items waiting for you." />
        )}
      </Section>

      <Section title="Explore the record">
        <View style={styles.links}>
          <Link href="/memory" asChild><Pressable style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={{ color: colors.foreground, fontFamily: 'DMSans_700Bold' }}>Memory search</Text><Body>Find user-added context</Body></Pressable></Link>
          <Link href="/activity" asChild><Pressable style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={{ color: colors.foreground, fontFamily: 'DMSans_700Bold' }}>Activity</Text><Body>See recorded changes</Body></Pressable></Link>
        </View>
      </Section>

      <Section title="Account">
        {accountError ? <InlineError message={accountError} /> : null}
        <Action label="Sign out" icon="log-out" secondary onPress={() => { void exit(); }} />
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  heroCard: { padding: 19, gap: 16 },
  heroTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  serif: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 26, lineHeight: 29 },
  progressRing: { width: 72, height: 72, borderWidth: 1.5, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  progressValue: { fontFamily: 'DMSans_700Bold', fontSize: 17 },
  progressLabel: { fontFamily: 'SpaceMono_400Regular', fontSize: 8, letterSpacing: 1 },
  inlineLink: { paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', flexGrow: 1, minHeight: 92, justifyContent: 'space-between' },
  metricValue: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 31 },
  metricLabel: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 16 },
  setupRow: { flexDirection: 'row', alignItems: 'center' },
  links: { flexDirection: 'row', gap: 10 },
  linkCard: { flex: 1, borderWidth: 1, borderRadius: 9, padding: 14, gap: 6, minHeight: 90 },
  promiseTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
});
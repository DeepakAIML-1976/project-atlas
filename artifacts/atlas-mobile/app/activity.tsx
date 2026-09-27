import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGetAtlasActivity } from '@workspace/api-client-react';
import { Body, Card, Empty, ErrorState, Loading, Page, Section, Status } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

export default function ActivityScreen() {
  const colors = useColors();
  const activity = useGetAtlasActivity();
  if (activity.isLoading) return <Page title="Activity"><Loading /></Page>;
  if (activity.isError) return <Page title="Activity"><ErrorState message={activity.error.message} retry={() => { void activity.refetch(); }} /></Page>;
  if (!activity.data) return <Page title="Activity"><Loading /></Page>;
  return (
    <Page title="Activity" eyebrow="An accountable record" onRefresh={() => { void activity.refetch(); }} backToOverview>
      <Body>Atlas records workspace changes so people can understand what happened and when.</Body>
      <Section title="Recent activity">
        {activity.data.length === 0 ? (
          <Empty icon="activity" title="No activity recorded" detail="As your workspace changes, the recorded activity will appear here." />
        ) : activity.data.map((entry) => (
          <Card key={entry.id} style={styles.row}>
            <Text style={[styles.bullet, { color: colors.primary }]}>·</Text>
            <ViewText action={entry.action} type={entry.recordType} date={new Date(entry.createdAt).toLocaleString()} />
          </Card>
        ))}
      </Section>
    </Page>
  );
}

function ViewText({ action, type, date }: { action: string; type: string; date: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, gap: 7 }}>
      <Text style={[styles.action, { color: colors.foreground }]}>{action}</Text>
      <Text style={[styles.date, { color: colors.mutedForeground }]}>{date}</Text>
      <Status>{type}</Status>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bullet: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 27 },
  action: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  date: { fontFamily: 'DMSans_400Regular', fontSize: 11 },
});
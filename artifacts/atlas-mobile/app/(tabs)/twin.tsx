import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useGetMyTwin, useUpdateMyTwinAutonomy, useUpdateMyTwinField } from '@workspace/api-client-react';
import type { TwinFieldKey } from '@workspace/api-client-react';
import { Action, Body, Card, ErrorState, Field, InlineError, Loading, Page, Section, Status } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

const profileFields: { key: TwinFieldKey; label: string; hint: string }[] = [
  { key: 'role', label: 'Role', hint: 'How you describe your work' },
  { key: 'expertise', label: 'Expertise', hint: 'Areas where you have experience' },
  { key: 'priorities', label: 'Priorities', hint: 'What currently matters most' },
  { key: 'communicationStyle', label: 'Communication style', hint: 'How you prefer to communicate' },
  { key: 'decisionMethodology', label: 'Decision methodology', hint: 'How you evaluate choices' },
  { key: 'riskTolerance', label: 'Risk tolerance', hint: 'Your comfort with uncertainty' },
  { key: 'delegationRules', label: 'Delegation rules', hint: 'What can be delegated' },
  { key: 'approvalLimits', label: 'Approval limits', hint: 'What always needs your approval' },
  { key: 'meetingBehavior', label: 'Meeting behavior', hint: 'How you work in meetings' },
  { key: 'stakeholderRelationships', label: 'Stakeholder relationships', hint: 'People and working relationships you choose to record' },
];

export default function TwinScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const twin = useGetMyTwin();
  const updateField = useUpdateMyTwinField();
  const updateAutonomy = useUpdateMyTwinAutonomy();
  const [drafts, setDrafts] = useState<Partial<Record<TwinFieldKey, string>>>({});
  const [autonomyReason, setAutonomyReason] = useState('');
  const [error, setError] = useState('');
  const [autonomyError, setAutonomyError] = useState('');
  const [savedField, setSavedField] = useState<TwinFieldKey | null>(null);
  const refetch = () => { void twin.refetch(); };

  if (twin.isLoading) return <Page title="My Twin"><Loading /></Page>;
  if (twin.isError) return <Page title="My Twin"><ErrorState message={twin.error.message} retry={refetch} /></Page>;
  const profile = twin.data;
  if (!profile) return <Page title="My Twin"><Loading /></Page>;
  const saveField = async (key: TwinFieldKey) => {
    const value = drafts[key] ?? profile.fields.find((field) => field.key === key)?.value ?? '';
    if (!value.trim()) return;
    setError('');
    setSavedField(null);
    try {
      await updateField.mutateAsync({ data: { key, value: value.trim() } });
      setSavedField(key);
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The profile field could not be saved.');
    }
  };
  const saveAutonomy = async (level: number) => {
    if (!autonomyReason.trim()) {
      setAutonomyError('Add a reason for changing the autonomy ceiling.');
      return;
    }
    setAutonomyError('');
    try {
      await updateAutonomy.mutateAsync({ data: { level, reason: autonomyReason.trim() } });
      await client.invalidateQueries();
    } catch (caught) {
      setAutonomyError(caught instanceof Error ? caught.message : 'Autonomy settings could not be updated.');
    }
  };

  return (
    <Page title="My Twin" eyebrow="A profile only you can confirm" onRefresh={refetch}>
      <Body>Review each field and make it yours. Unknown values stay blank; nothing is silently inferred into your profile.</Body>
      <Card style={styles.profileCard}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{profile.displayName || 'Your profile'}</Text>
          <Body>{profile.profileCompletion}% complete · based on information you have reviewed</Body>
        </View>
      </Card>
      <Section title="Your profile">
        {profileFields.map(({ key, label, hint }) => {
          const existing = profile.fields.find((field) => field.key === key);
          const value = drafts[key] ?? existing?.value ?? '';
          return (
            <Card key={key} style={styles.fieldCard}>
              <View style={styles.fieldTitle}>
                <Text style={[styles.fieldHeading, { color: colors.foreground }]}>{label}</Text>
                <Status>{existing?.evidenceStatus ?? 'unknown'}</Status>
              </View>
              <Field label={hint} value={value} onChangeText={(next) => setDrafts((current) => ({ ...current, [key]: next }))} multiline placeholder="Add what you want Atlas to know" maxLength={6000} />
              {savedField === key ? <Text style={{ color: colors.primary, fontFamily: 'DMSans_600SemiBold', fontSize: 12 }}>Saved to your reviewed profile</Text> : null}
              {error ? <InlineError message={error} /> : null}
              <Action compact label={updateField.isPending ? 'Saving…' : 'Save field'} icon="check" onPress={() => { void saveField(key); }} disabled={updateField.isPending || !value.trim()} />
            </Card>
          );
        })}
      </Section>
      <Section title="Autonomy ceiling">
        <Card>
          <Text style={[styles.fieldHeading, { color: colors.foreground }]}>{profile.autonomy.label}</Text>
          <Body>Current ceiling: {profile.autonomy.level} of 10. Human approval is required for decisions and consequential actions at every level.</Body>
          <Field label="Why are you changing this ceiling?" value={autonomyReason} onChangeText={setAutonomyReason} multiline placeholder="Your reason is recorded with the setting" maxLength={1000} />
          <View style={styles.levels}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((level) => (
              <Pressable
                key={level}
                accessibilityRole="button"
                accessibilityLabel={`Set autonomy level ${level}`}
                accessibilityState={{ selected: level === profile.autonomy.level }}
                onPress={() => { void saveAutonomy(level); }}
                style={[styles.level, { backgroundColor: level === profile.autonomy.level ? colors.primary : colors.secondary }]}
              >
                <Text style={{ color: level === profile.autonomy.level ? colors.primaryForeground : colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 13 }}>{level}</Text>
              </Pressable>
            ))}
          </View>
          {autonomyError ? <InlineError message={autonomyError} /> : null}
          <Body>Choose a level to save it with the reason above.</Body>
        </Card>
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  profileCard: { flexDirection: 'row', alignItems: 'center' },
  profileName: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 25 },
  fieldCard: { gap: 12 },
  fieldTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fieldHeading: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  level: { overflow: 'hidden', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
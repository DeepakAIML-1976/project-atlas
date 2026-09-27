import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAnalyzeAtlasSource,
  useCreateAtlasSource,
  useDeleteAtlasSource,
  useGetAtlasSources,
  useUpdateMyTwinField,
} from '@workspace/api-client-react';
import type { ProfileSuggestion } from '@workspace/api-client-react';
import { Action, Body, Card, Empty, ErrorState, Field, InlineError, Loading, Page, Section, Status } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

export default function SourcesScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const sources = useGetAtlasSources();
  const createSource = useCreateAtlasSource();
  const deleteSource = useDeleteAtlasSource();
  const analyzeSource = useAnalyzeAtlasSource();
  const updateField = useUpdateMyTwinField();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [permission, setPermission] = useState(false);
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, ProfileSuggestion[]>>({});
  const [savedSuggestion, setSavedSuggestion] = useState('');
  const refresh = () => { void sources.refetch(); };

  const addNote = async () => {
    setError('');
    try {
      await createSource.mutateAsync({
        data: {
          title: title.trim(),
          kind: 'note',
          content: content.trim() || null,
          objectPath: null,
          contentType: 'text/plain',
          sourceDate: null,
          permissionConfirmed: permission,
          profileAnalysisConsent: analysisConsent,
        },
      });
      setTitle('');
      setContent('');
      setPermission(false);
      setAnalysisConsent(false);
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This note could not be added.');
    }
  };
  const remove = async (sourceId: string) => {
    setError('');
    try {
      await deleteSource.mutateAsync({ sourceId });
      setConfirmDelete(null);
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This source could not be removed.');
    }
  };
  const analyze = async (sourceId: string) => {
    setError('');
    try {
      const result = await analyzeSource.mutateAsync({ sourceId, data: { confirmAnalysis: true } });
      setSuggestions((current) => ({ ...current, [sourceId]: result.suggestions }));
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analysis could not be requested.');
    }
  };
  const acceptSuggestion = async (sourceId: string, suggestion: ProfileSuggestion) => {
    setError('');
    try {
      await updateField.mutateAsync({ data: { key: suggestion.key, value: suggestion.suggestedValue, sourceIds: [sourceId] } });
      setSavedSuggestion(`${sourceId}:${suggestion.key}`);
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The suggestion could not be saved.');
    }
  };

  if (sources.isLoading) return <Page title="Sources"><Loading /></Page>;
  if (sources.isError) return <Page title="Sources"><ErrorState message={sources.error.message} retry={refresh} /></Page>;
  if (!sources.data) return <Page title="Sources"><Loading /></Page>;

  return (
    <Page title="Sources" eyebrow="Only what you choose to bring in" onRefresh={refresh}>
      <Body>Your sources stay tied to your workspace. Confirm you have permission before adding anything; profile analysis is a separate, optional consent.</Body>
      <Card>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>Add a note</Text>
        <Field label="Note title" value={title} onChangeText={setTitle} placeholder="A useful piece of context" maxLength={240} />
        <Field label="Note" value={content} onChangeText={setContent} placeholder="Write or paste a note you are authorized to share" multiline />
        <Consent checked={permission} onToggle={() => setPermission(!permission)} label="I have permission to add this information to the workspace." />
        <Consent checked={analysisConsent} onToggle={() => setAnalysisConsent(!analysisConsent)} label="I also consent to profile suggestions from this note. I will review each suggestion before applying it." />
        {error ? <InlineError message={error} /> : null}
        <Action label={createSource.isPending ? 'Adding…' : 'Add source'} onPress={addNote} icon="plus" disabled={createSource.isPending || !title.trim() || !permission} />
      </Card>

      <Section title="Workspace sources">
        {sources.data.length === 0 ? (
          <Empty icon="file-text" title="A clean slate" detail="No sources have been added. Notes you choose to share will appear here." />
        ) : sources.data.map((source) => {
          const sourceSuggestions = suggestions[source.id] ?? source.analysisSuggestions;
          return (
          <Card key={source.id}>
            <View style={styles.rowHead}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={[styles.sourceTitle, { color: colors.foreground }]}>{source.title}</Text>
                <Body>{source.kind} · Added {new Date(source.createdAt).toLocaleDateString()}</Body>
              </View>
              <Status>{source.analysisStatus.replaceAll('_', ' ')}</Status>
            </View>
            <View style={styles.consentBadges}>
              <Status>{source.permissionConfirmed ? 'permission confirmed' : 'permission not confirmed'}</Status>
              <Status>{source.profileAnalysisConsent ? 'analysis allowed' : 'analysis off'}</Status>
            </View>
            {source.profileAnalysisConsent ? (
              <Action compact label={analyzeSource.isPending ? 'Reviewing…' : 'Request profile suggestions'} onPress={() => { void analyze(source.id); }} icon="search" secondary disabled={analyzeSource.isPending} />
            ) : (
              <Body>Profile analysis is off. You can still keep this source in your record.</Body>
            )}
            {sourceSuggestions.map((suggestion) => (
              <Card key={`${source.id}-${suggestion.key}`} style={{ backgroundColor: colors.muted }}>
                <Text style={{ color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 14 }}>{suggestion.key}</Text>
                <Body>“{suggestion.suggestedValue}”</Body>
                <Body>Evidence: {suggestion.evidence}</Body>
                {savedSuggestion === `${source.id}:${suggestion.key}` ? <Status>saved after your review</Status> : <Action compact label="Apply after review" onPress={() => { void acceptSuggestion(source.id, suggestion); }} icon="check" />}
              </Card>
            ))}
            {error ? <InlineError message={error} /> : null}
            {confirmDelete === source.id ? (
              <View style={styles.deleteConfirm}>
                <Body>Remove this source and its eligibility for analysis?</Body>
                <View style={styles.actions}>
                  <Action compact secondary label="Keep source" onPress={() => setConfirmDelete(null)} />
                  <Action compact label={deleteSource.isPending ? 'Removing…' : 'Confirm remove'} onPress={() => { void remove(source.id); }} disabled={deleteSource.isPending} />
                </View>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(source.id)} style={styles.remove}>
                <Text style={{ color: colors.destructive, fontFamily: 'DMSans_600SemiBold', fontSize: 13 }}>Remove source</Text>
              </Pressable>
            )}
          </Card>
          );
        })}
      </Section>
    </Page>
  );
}

function Consent({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.consent}>
      <View style={[styles.check, { borderColor: checked ? colors.primary : colors.input, backgroundColor: checked ? colors.primary : colors.card }]}>
        {checked ? <Text style={{ color: colors.primaryForeground, fontSize: 13 }}>✓</Text> : null}
      </View>
      <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 25 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sourceTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
  consentBadges: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { width: 21, height: 21, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  deleteConfirm: { borderTopWidth: 1, borderTopColor: 'transparent', paddingTop: 9, gap: 8 },
  remove: { alignSelf: 'flex-start', paddingVertical: 6 },
});
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateAtlasMeeting, useCreateMeetingAction, useGetAtlasMeetings, useUpdateMeetingAction } from '@workspace/api-client-react';
import { Action, Body, Card, Empty, ErrorState, Field, InlineError, Loading, Page, Section, Status } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

export default function MeetingsScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const meetings = useGetAtlasMeetings();
  const createMeeting = useCreateAtlasMeeting();
  const createAction = useCreateMeetingAction();
  const updateAction = useUpdateMeetingAction();
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [notes, setNotes] = useState('');
  const [participants, setParticipants] = useState('');
  const [informed, setInformed] = useState(false);
  const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const refresh = () => { void meetings.refetch(); };

  const addMeeting = async () => {
    setError('');
    try {
      await createMeeting.mutateAsync({
        data: {
          title: title.trim(),
          scheduledAt: null,
          participants: participants.split(',').map((name) => name.trim()).filter(Boolean),
          agenda: agenda.trim() || null,
          notes: notes.trim() || null,
          sourceId: null,
          participantsInformed: informed,
        },
      });
      setTitle('');
      setAgenda('');
      setNotes('');
      setParticipants('');
      setInformed(false);
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The meeting could not be recorded.');
    }
  };
  const addAction = async (meetingId: string) => {
    const actionTitle = actionDrafts[meetingId]?.trim();
    if (!actionTitle) return;
    setError('');
    try {
      await createAction.mutateAsync({ meetingId, data: { title: actionTitle, owner: null, dueAt: null } });
      setActionDrafts((current) => ({ ...current, [meetingId]: '' }));
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The action could not be added.');
    }
  };
  const toggleAction = async (meetingId: string, actionId: string, status: string) => {
    setError('');
    try {
      await updateAction.mutateAsync({ meetingId, actionId, data: { status: status === 'complete' ? 'open' : 'complete' } });
      await client.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The action status could not be updated.');
    }
  };

  if (meetings.isLoading) return <Page title="Meetings"><Loading /></Page>;
  if (meetings.isError) return <Page title="Meetings"><ErrorState message={meetings.error.message} retry={refresh} /></Page>;
  if (!meetings.data) return <Page title="Meetings"><Loading /></Page>;
  return (
    <Page title="Meetings" eyebrow="Briefings and shared context" onRefresh={refresh}>
      <Body>Record meetings your team has chosen to share. Participants should know before a meeting record is added.</Body>
      <Card>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>Record a meeting</Text>
        <Field label="Meeting title" value={title} onChangeText={setTitle} placeholder="What was the conversation about?" maxLength={240} />
        <Field label="Participants (comma separated)" value={participants} onChangeText={setParticipants} placeholder="Names participants have shared" />
        <Field label="Agenda" value={agenda} onChangeText={setAgenda} placeholder="Optional agenda" multiline />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Notes you are authorized to share" multiline />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: informed }} onPress={() => setInformed(!informed)} style={styles.confirm}>
          <View style={[styles.check, { backgroundColor: informed ? colors.primary : colors.card, borderColor: informed ? colors.primary : colors.input }]}>{informed ? <Text style={{ color: colors.primaryForeground }}>✓</Text> : null}</View>
          <Body style={{ flex: 1 }}>I confirm participants were informed about this record.</Body>
        </Pressable>
        {error ? <InlineError message={error} /> : null}
        <Action label={createMeeting.isPending ? 'Saving…' : 'Save meeting'} icon="plus" onPress={addMeeting} disabled={createMeeting.isPending || !title.trim() || !informed} />
      </Card>

      <Section title="Recorded meetings">
        {meetings.data.length === 0 ? (
          <Empty icon="users" title="No meetings yet" detail="When you add a meeting, its context and agreed actions will live here." />
        ) : meetings.data.map((meeting) => (
          <Card key={meeting.id}>
            <View style={styles.rowHead}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={[styles.meetingTitle, { color: colors.foreground }]}>{meeting.title}</Text>
                <Body>{meeting.scheduledAt ? new Date(meeting.scheduledAt).toLocaleString() : `Recorded ${new Date(meeting.createdAt).toLocaleDateString()}`}</Body>
              </View>
              <Status>{meeting.participantsInformed ? 'participants informed' : 'consent required'}</Status>
            </View>
            {meeting.participants.length ? <Body>With {meeting.participants.join(', ')}</Body> : null}
            {meeting.agenda ? <Text style={{ color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 13 }}>Agenda · {meeting.agenda}</Text> : null}
            {meeting.notes ? <Body>{meeting.notes}</Body> : null}
            <View style={[styles.divider, { borderTopColor: colors.border }]} />
            <Text style={{ color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 14 }}>Actions</Text>
            {meeting.actions.length ? meeting.actions.map((action) => (
              <View key={action.id} style={styles.actionRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 13 }}>{action.title}</Text>
                  <Body>{action.owner ? `Owner: ${action.owner} · ` : ''}{action.status.replaceAll('_', ' ')}</Body>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={action.status === 'complete' ? 'Reopen action' : 'Mark action complete'} onPress={() => { void toggleAction(meeting.id, action.id, action.status); }}>
                  <Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold', fontSize: 12 }}>{action.status === 'complete' ? 'Reopen' : 'Complete'}</Text>
                </Pressable>
              </View>
            )) : <Body>No actions have been recorded for this meeting.</Body>}
            <Field label="New action" value={actionDrafts[meeting.id] ?? ''} onChangeText={(value) => setActionDrafts((current) => ({ ...current, [meeting.id]: value }))} placeholder="An action agreed by the team" maxLength={500} />
            <Action compact label={createAction.isPending ? 'Adding…' : 'Add action'} icon="plus" secondary disabled={createAction.isPending || !actionDrafts[meeting.id]?.trim()} onPress={() => { void addAction(meeting.id); }} />
            {error ? <InlineError message={error} /> : null}
          </Card>
        ))}
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 25 },
  confirm: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { width: 21, height: 21, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  meetingTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
  divider: { borderTopWidth: 1, marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 },
});
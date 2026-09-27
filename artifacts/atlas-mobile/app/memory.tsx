import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useSearchAtlasMemory } from '@workspace/api-client-react';
import { Body, Card, Empty, ErrorState, Field, Loading, Page, Section, Status } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

export default function MemoryScreen() {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const results = useSearchAtlasMemory({ q: query.trim() }, { query: { enabled: query.trim().length > 0, queryKey: ['/api/atlas/memory/search', query.trim()] } });
  const records = results.data ?? [];
  return (
    <Page title="Memory" eyebrow="Search the record" backToOverview>
      <Body>Search only information your workspace has chosen to add. Results retain their record type and source date.</Body>
      <Field label="Search terms" value={query} onChangeText={setQuery} placeholder="Try a project, person, or decision" returnKeyType="search" />
      {query.trim().length === 0 ? (
        <Empty icon="search" title="Start with a search" detail="Enter a few terms to find relevant user-provided context." />
      ) : results.isLoading ? (
        <Loading />
      ) : results.isError ? (
        <ErrorState message={results.error.message} retry={() => { void results.refetch(); }} />
      ) : records.length === 0 ? (
        <Empty icon="search" title="Nothing matched" detail="No records matched these terms. Try a different phrase." />
      ) : (
        <Section title={`${records.length} ${records.length === 1 ? 'result' : 'results'}`}>
          {records.map((result) => (
            <Card key={`${result.recordType}-${result.id}`}>
              <Status>{result.recordType}</Status>
              <Text style={[styles.resultTitle, { color: colors.foreground }]}>{result.title}</Text>
              {result.excerpt ? <Body>{result.excerpt}</Body> : null}
              <Body>{result.sourceDate ? new Date(result.sourceDate).toLocaleDateString() : 'No source date recorded'}</Body>
            </Card>
          ))}
        </Section>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  resultTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
});
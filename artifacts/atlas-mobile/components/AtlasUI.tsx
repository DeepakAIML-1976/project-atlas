import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export function Page({ title, eyebrow, children, onRefresh, backToOverview = false }: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onRefresh?: () => void;
  backToOverview?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      bottomOffset={20}
      contentContainerStyle={[
        styles.page,
        {
          paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) + 18 : insets.top + 18,
          paddingBottom: Platform.OS === 'web' ? 118 : insets.bottom + 112,
        },
      ]}
    >
      <View style={styles.brandRow}>
        {backToOverview ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to overview" onPress={() => router.replace('/(tabs)')} hitSlop={9}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View style={[styles.brandMark, { borderColor: colors.primary }]}>
          <Text style={{ color: colors.primary, fontFamily: 'InstrumentSerif_400Regular', fontSize: 27 }}>A</Text>
        </View>
        <Text style={[styles.brandName, { color: colors.foreground }]}>ATLAS</Text>
        <View style={{ flex: 1 }} />
        {onRefresh ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh" onPress={onRefresh} hitSlop={10}>
            <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {eyebrow ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text> : null}
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {children}
    </KeyboardAwareScrollViewCompat>
  );
}

export function Body({ children, style }: { children: ReactNode; style?: object }) {
  const colors = useColors();
  return <Text style={[styles.body, { color: colors.mutedForeground }, style]}>{children}</Text>;
}

export function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }, style]}>{children}</View>;
}

export function Action({ label, onPress, secondary, disabled, icon, compact }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: keyof typeof Feather.glyphMap; compact?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        compact && styles.compactAction,
        { backgroundColor: secondary ? colors.secondary : colors.primary, opacity: disabled ? 0.48 : pressed ? 0.82 : 1, borderRadius: colors.radius },
      ]}
    >
      {icon ? <Feather name={icon} size={16} color={secondary ? colors.foreground : colors.primaryForeground} /> : null}
      <Text style={{ color: secondary ? colors.foreground : colors.primaryForeground, fontFamily: 'DMSans_700Bold', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, multiline, ...props }: TextInputProps & {
  label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input, borderRadius: colors.radius },
          multiline && styles.multiline,
        ]}
        {...props}
      />
    </View>
  );
}

export function Empty({ icon = 'inbox', title, detail, action }: {
  icon?: keyof typeof Feather.glyphMap; title: string; detail: string; action?: ReactNode;
}) {
  const colors = useColors();
  return (
    <Card style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Body style={{ textAlign: 'center' }}>{detail}</Body>
      {action}
    </Card>
  );
}

export function Loading() {
  const colors = useColors();
  return <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>;
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  const colors = useColors();
  return (
    <Card style={{ borderColor: colors.destructive, padding: 18 }}>
      <Text style={{ color: colors.destructive, fontFamily: 'DMSans_700Bold', fontSize: 16 }}>Couldn’t load this view</Text>
      <Body style={{ marginVertical: 10 }}>{message}</Body>
      <Action label="Try again" icon="refresh-cw" onPress={retry} secondary />
    </Card>
  );
}

export function InlineError({ message }: { message: string }) {
  const colors = useColors();
  return <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{message}</Text>;
}

export function Status({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.status, { backgroundColor: colors.accent }]}><Text style={{ color: colors.accentForeground, fontFamily: 'SpaceMono_400Regular', fontSize: 10, textTransform: 'uppercase' }}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 22, gap: 14 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 10 },
  brandMark: { width: 31, height: 31, borderWidth: 1.3, borderRadius: 18, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-18deg' }] },
  brandName: { fontFamily: 'DMSans_700Bold', fontSize: 12, letterSpacing: 2.4 },
  eyebrow: { fontFamily: 'SpaceMono_400Regular', fontSize: 10, letterSpacing: 1.6, marginTop: 4, textTransform: 'uppercase' },
  title: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 40, lineHeight: 45, marginBottom: 5 },
  body: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 21 },
  section: { gap: 12, marginTop: 13 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'DMSans_700Bold', fontSize: 17, letterSpacing: -0.3 },
  card: { borderWidth: 1, padding: 17, gap: 11 },
  action: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18, paddingVertical: 12 },
  compactAction: { alignSelf: 'flex-start', minHeight: 38, paddingHorizontal: 13, paddingVertical: 8 },
  field: { gap: 7 },
  label: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  input: { minHeight: 47, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11, fontFamily: 'DMSans_400Regular', fontSize: 15 },
  multiline: { minHeight: 104, textAlignVertical: 'top' },
  empty: { alignItems: 'center', paddingVertical: 27, paddingHorizontal: 19 },
  emptyIcon: { width: 48, height: 48, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: 'DMSans_700Bold', fontSize: 17, textAlign: 'center' },
  loading: { minHeight: 130, alignItems: 'center', justifyContent: 'center' },
  status: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6 },
});
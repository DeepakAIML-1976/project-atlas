import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, Body, Field, InlineError } from '@/components/AtlasUI';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, fetchStatus: signInFetch } = useSignIn();
  const { signUp, fetchStatus: signUpFetch } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const busy = signInFetch === 'fetching' || signUpFetch === 'fetching';

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);

  const submit = async () => {
    setError('');
    try {
      if (creating) {
        const result = await signUp.password({ emailAddress: email.trim(), password });
        if (result.error) {
          setError(result.error.message);
          return;
        }
        await signUp.verifications.sendEmailCode();
        setVerifying(true);
        return;
      }
      const result = await signIn.password({ emailAddress: email.trim(), password });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setError('Your account needs an additional security step before opening Atlas.');
              return;
            }
            router.replace('/(tabs)');
          },
        });
      } else if (signIn.status === 'needs_client_trust') {
        await signIn.mfa.sendEmailCode();
        setVerifying(true);
      } else {
        setError('This sign-in needs another verification step. Please contact your workspace administrator.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication could not be completed. Please try again.');
    }
  };

  const continueWithGoogle = async () => {
    setError('');
    try {
      const { createdSessionId, setActive, signIn: ssoSignIn, signUp: ssoSignUp } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setError('Your account needs an additional security step before opening Atlas.');
              return;
            }
            router.replace('/(tabs)');
          },
        });
      } else if (ssoSignIn?.status === 'needs_client_trust' || ssoSignUp?.status === 'missing_requirements') {
        setError('This Google account needs another verification step. Please use email and password or contact your administrator.');
      } else {
        setError('Google sign-in could not be completed. Please try email and password.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign-in could not be completed.');
    }
  };

  const verify = async () => {
    setError('');
    try {
      const result = creating
        ? await signUp.verifications.verifyEmailCode({ code: code.trim() })
        : await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      if (creating && signUp.status === 'complete') {
        await signUp.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setError('Your account needs an additional security step before opening Atlas.');
              return;
            }
            router.replace('/(tabs)');
          },
        });
      } else if (!creating && signIn.status === 'complete') {
        await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setError('Your account needs an additional security step before opening Atlas.');
              return;
            }
            router.replace('/(tabs)');
          },
        });
      } else {
        setError('Verification is not complete. Check the code and try again.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The verification code could not be checked.');
    }
  };

  const switchMode = () => {
    setCreating(!creating);
    setVerifying(false);
    setCode('');
    setPassword('');
    setError('');
    if (creating) signUp.reset();
    else signIn.reset();
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.wrap,
        {
          paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) + 26 : insets.top + 26,
          paddingBottom: insets.bottom + 30,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={72}
    >
      <View style={styles.brand}>
        <Image source={require('@/assets/images/atlas-brand-icon.png')} style={styles.logo} accessibilityLabel="Atlas mark" />
        <Text style={[styles.wordmark, { color: colors.foreground }]}>PROJECT ATLAS</Text>
      </View>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>A human-led intelligence system</Text>
      <Text style={[styles.hero, { color: colors.foreground }]}>
        {verifying ? 'One last step.' : creating ? 'Build a better memory.' : 'Your work, with context.'}
      </Text>
      <Body style={styles.intro}>
        {verifying
          ? `Enter the verification code sent to ${email}.`
          : 'A trusted companion for the knowledge, decisions and relationships that shape your work.'}
      </Body>
      <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {verifying ? (
          <>
            <Field label="Email verification code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
            {error ? <InlineError message={error} /> : null}
            <Action label="Verify email" onPress={verify} disabled={!code.trim() || busy} icon="check" />
            <Pressable onPress={async () => {
              try {
                if (creating) await signUp.verifications.sendEmailCode();
                else await signIn.mfa.sendEmailCode();
                setError('');
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'A new code could not be sent.');
              }
            }}>
              <Text style={[styles.link, { color: colors.primary }]}>Send a new code</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable accessibilityRole="button" onPress={() => { void continueWithGoogle(); }} disabled={busy} style={({ pressed }) => [styles.google, { borderColor: colors.border, opacity: pressed || busy ? 0.7 : 1 }]}>
              <Ionicons name="logo-google" size={17} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 14 }}>Continue with Google</Text>
            </Pressable>
            <View style={styles.divider}>
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'SpaceMono_400Regular', fontSize: 9 }}>OR EMAIL</Text>
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
            </View>
            <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={creating ? 'new-password' : 'current-password'} textContentType={creating ? 'newPassword' : 'password'} />
            {error ? <InlineError message={error} /> : null}
            <Action label={busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'} onPress={submit} disabled={busy || !email.trim() || !password} icon="arrow-right" />
            <Pressable accessibilityRole="button" onPress={switchMode} style={styles.switch}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13 }}>
                {creating ? 'Already have an account? ' : 'New to Atlas? '}
              </Text>
              <Text style={[styles.link, { color: colors.primary }]}>{creating ? 'Sign in' : 'Create account'}</Text>
            </Pressable>
            {creating ? <View nativeID="clerk-captcha" /> : null}
          </>
        )}
      </View>
      <View style={styles.promise}>
        <Text style={[styles.promiseTitle, { color: colors.foreground }]}>Your judgment stays yours.</Text>
        <Body>Atlas does not make decisions or act on your behalf. Your information remains under your control.</Body>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 25, flexGrow: 1, justifyContent: 'center', gap: 15 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13 },
  logo: { width: 42, height: 42, borderRadius: 21 },
  wordmark: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, letterSpacing: 2.1 },
  eyebrow: { fontFamily: 'SpaceMono_400Regular', fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase' },
  hero: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 48, lineHeight: 50, maxWidth: 350 },
  intro: { fontSize: 15, lineHeight: 23, maxWidth: 380, marginBottom: 7 },
  form: { borderWidth: 1, padding: 19, gap: 15 },
  google: { minHeight: 47, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  rule: { height: 1, flex: 1 },
  link: { fontFamily: 'DMSans_700Bold', fontSize: 13, textAlign: 'center' },
  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 5 },
  promise: { borderTopWidth: 1, borderTopColor: 'transparent', paddingTop: 14, gap: 6 },
  promiseTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
});
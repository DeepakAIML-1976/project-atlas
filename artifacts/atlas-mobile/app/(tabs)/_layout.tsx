import React, { useEffect } from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useColors } from '@/hooks/useColors';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="twin">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>My Twin</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sources">
        <NativeTabs.Trigger.Icon sf={{ default: 'tray.full', selected: 'tray.full.fill' }} />
        <NativeTabs.Trigger.Label>Sources</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="meetings">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} />
        <NativeTabs.Trigger.Label>Meetings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="decisions">
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.seal', selected: 'checkmark.seal.fill' }} />
        <NativeTabs.Trigger.Label>Decisions</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: ({ color }) => isIOS ? <SymbolView name="square.grid.2x2" tintColor={color} size={23} /> : <Feather name="grid" size={21} color={color} /> }} />
      <Tabs.Screen name="twin" options={{ title: 'My Twin', tabBarIcon: ({ color }) => isIOS ? <SymbolView name="person.crop.circle" tintColor={color} size={23} /> : <Feather name="user" size={21} color={color} /> }} />
      <Tabs.Screen name="sources" options={{ title: 'Sources', tabBarIcon: ({ color }) => isIOS ? <SymbolView name="tray.full" tintColor={color} size={23} /> : <Feather name="archive" size={21} color={color} /> }} />
      <Tabs.Screen name="meetings" options={{ title: 'Meetings', tabBarIcon: ({ color }) => isIOS ? <SymbolView name="person.3" tintColor={color} size={23} /> : <Feather name="users" size={21} color={color} /> }} />
      <Tabs.Screen name="decisions" options={{ title: 'Decisions', tabBarIcon: ({ color }) => isIOS ? <SymbolView name="checkmark.seal" tintColor={color} size={23} /> : <Feather name="check-circle" size={21} color={color} /> }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/" />;
  return isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />;
}
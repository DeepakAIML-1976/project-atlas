import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/expo';
import AuthScreen from '@/components/AuthScreen';

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return isSignedIn ? <Redirect href="/(tabs)" /> : <AuthScreen />;
}
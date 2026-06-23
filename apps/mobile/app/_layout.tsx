import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { initializeDB } from '../src/db';
import * as SecureStore from '../src/utils/secureStore';
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  const isUnlocked = useAuthStore(s => s.isUnlocked);
  const storeEmail = useAuthStore(s => s.email);
  const [isReady, setIsReady] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);

  const hasAccountResolved = hasAccount || !!storeEmail;

  useEffect(() => {
    async function prepare() {
      try {
        initializeDB();
        const email = await SecureStore.getItemAsync('kk_email');
        if (email) {
          setHasAccount(true);
          useAuthStore.getState().setEmail(email);
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setIsReady(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    if (!hasAccountResolved) {
      router.replace('/(auth)/onboarding');
    } else if (!isUnlocked) {
      router.replace('/(auth)/lock');
    } else {
      router.replace('/(main)');
    }
  }, [isReady, hasAccountResolved, isUnlocked]);

  useEffect(() => {
    if (isUnlocked) {
      import('../src/sync/engine').then(({ performSync }) => {
        performSync('on_open').catch(err => console.log('Unlock auto-sync failed:', err));
      });
    }
  }, [isUnlocked]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e8ebe6' }}>
        <ActivityIndicator size="large" color="#0e0f0c" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

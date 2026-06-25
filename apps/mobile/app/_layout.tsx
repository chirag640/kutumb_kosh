import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { initializeDB } from '../src/db';
import { registerEODSync } from '../src/sync/scheduler';
import * as SecureStore from '../src/utils/secureStore';
import { ActivityIndicator, View, AppState, AppStateStatus } from 'react-native';

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
        await registerEODSync();
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

  // Background Lock Timeout Listener
  useEffect(() => {
    let backgroundTimestamp = 0;

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        backgroundTimestamp = Date.now();
      } else if (nextAppState === 'active') {
        const auth = useAuthStore.getState();
        if (auth.isUnlocked && backgroundTimestamp > 0) {
          const timeoutStr = await SecureStore.getItemAsync('kk_lock_timeout') ?? '0';
          const timeoutMs = parseInt(timeoutStr, 10);

          if (timeoutMs === -1) {
            // "Never" lock on background
            backgroundTimestamp = 0;
            return;
          }

          const elapsed = Date.now() - backgroundTimestamp;
          if (elapsed > timeoutMs) {
            auth.lock();
          }
        }
        backgroundTimestamp = 0;
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
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

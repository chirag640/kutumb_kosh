import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { useIsMounted } from '../src/hooks/useIsMounted';
import * as Sentry from '@sentry/react-native';
import { useAuthStore } from '../src/store/authStore';
import { initializeDB } from '../src/db';
import { registerEODSync, scheduleAlertsIfNeeded } from '../src/sync/scheduler';
import * as SecureStore from '../src/utils/secureStore';
import * as Notifications from '../src/utils/notifications';
import { ActivityIndicator, View, AppState, AppStateStatus, LogBox } from 'react-native';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Theme } from '../src/constants/theme';

// Silence warning alerts out of developer control (Expo Go notifications/deprecations)
LogBox.ignoreLogs([
  'expo-background-fetch: This library is deprecated',
  'setNotificationHandler: Notifications are disabled',
  'getPermissionsAsync: Notifications are disabled',
  'requestPermissionsAsync: Notifications are disabled',
  'getAllScheduledNotificationsAsync: Notifications are disabled',
  'Notifications are disabled in Android Expo Go'
]);

// Initialize Sentry for crash and error reporting
// eslint-disable-next-line no-console
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (!dsn && !__DEV__) {
  console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN is not set — crash reporting is inactive.');
}

Sentry.init({
  dsn: dsn ?? '',
  debug: __DEV__,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  enabled: !__DEV__ || !!dsn,
});

function RootLayout() {
  const isUnlocked = useAuthStore(s => s.isUnlocked);
  const storeEmail = useAuthStore(s => s.email);
  const [isReady, setIsReady] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const isMounted = useIsMounted();

  const hasAccountResolved = hasAccount || !!storeEmail;

  useEffect(() => {
    async function prepare() {
      try {
        initializeDB();
        await registerEODSync();

        // Configure foreground notifications
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        // Request notification permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }

        // Run local offline alert scheduler
        await scheduleAlertsIfNeeded().catch(() => {});

        const email = await SecureStore.getItemAsync('kk_email');
        if ( email) {
          setHasAccount(true);
          useAuthStore.getState().setEmail(email);
        }
      } catch (e: unknown) {
        Sentry.captureException(e);
      } finally {
        if (isMounted()) {
          setIsReady(true);
        }
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
        if (isMounted()) {
          performSync('on_open').catch(() => {});
        }
      });
    }
  }, [isUnlocked]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.background }}>
        <ActivityIndicator size="large" color={Theme.colors.ink} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }} />
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);

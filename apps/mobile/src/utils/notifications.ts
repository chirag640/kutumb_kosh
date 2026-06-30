import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type {
  NotificationHandler,
  NotificationRequestInput,
  Notification,
  NotificationRequest,
  NotificationPermissionsStatus,
} from 'expo-notifications';

// Lazily loaded Notifications module to prevent side-effect crash in Expo Go on Android
let NotificationsModule: typeof import('expo-notifications') | null = null;

const isAndroidExpoGo = Platform.OS === 'android' && isRunningInExpoGo();

if (!isAndroidExpoGo) {
  try {
    NotificationsModule = require('expo-notifications');
  } catch (error) {
    console.warn('Failed to load expo-notifications module:', error);
  }
}

export const SchedulableTriggerInputTypes = (NotificationsModule?.SchedulableTriggerInputTypes || {
  DATE: 'date' as const,
  TIME_INTERVAL: 'timeInterval' as const,
  DAILY: 'daily' as const,
  WEEKLY: 'weekly' as const,
  MONTHLY: 'monthly' as const,
  YEARLY: 'yearly' as const,
  CALENDAR: 'calendar' as const,
}) as typeof import('expo-notifications').SchedulableTriggerInputTypes;

export async function getPermissionsAsync(): Promise<NotificationPermissionsStatus> {
  if (isAndroidExpoGo || !NotificationsModule) {
    console.warn('getPermissionsAsync: Notifications are disabled in Android Expo Go');
    return {
      status: 'denied',
      granted: false,
      expires: 'never',
      canAskAgain: false,
    } as any;
  }
  return NotificationsModule.getPermissionsAsync();
}

export async function requestPermissionsAsync(): Promise<NotificationPermissionsStatus> {
  if (isAndroidExpoGo || !NotificationsModule) {
    console.warn('requestPermissionsAsync: Notifications are disabled in Android Expo Go');
    return {
      status: 'denied',
      granted: false,
      expires: 'never',
      canAskAgain: false,
    } as any;
  }
  return NotificationsModule.requestPermissionsAsync();
}

export function setNotificationHandler(handler: NotificationHandler | null): void {
  if (isAndroidExpoGo || !NotificationsModule) {
    console.warn('setNotificationHandler: Notifications are disabled in Android Expo Go');
    return;
  }
  return NotificationsModule.setNotificationHandler(handler);
}

export async function scheduleNotificationAsync(request: NotificationRequestInput): Promise<string> {
  if (isAndroidExpoGo || !NotificationsModule) {
    console.warn('scheduleNotificationAsync: Notifications are disabled in Android Expo Go');
    return 'mocked-notification-id';
  }
  return NotificationsModule.scheduleNotificationAsync(request);
}

export async function getAllScheduledNotificationsAsync(): Promise<NotificationRequest[]> {
  if (isAndroidExpoGo || !NotificationsModule) {
    console.warn('getAllScheduledNotificationsAsync: Notifications are disabled in Android Expo Go');
    return [];
  }
  return NotificationsModule.getAllScheduledNotificationsAsync();
}

export async function cancelScheduledNotificationAsync(identifier: string): Promise<void> {
  if (isAndroidExpoGo || !NotificationsModule) {
    console.warn('cancelScheduledNotificationAsync: Notifications are disabled in Android Expo Go');
    return;
  }
  return NotificationsModule.cancelScheduledNotificationAsync(identifier);
}

export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  if (isAndroidExpoGo || !NotificationsModule) {
    console.warn('cancelAllScheduledNotificationsAsync: Notifications are disabled in Android Expo Go');
    return;
  }
  return NotificationsModule.cancelAllScheduledNotificationsAsync();
}

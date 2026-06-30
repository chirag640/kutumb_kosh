import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';
import { createLogger } from './logger';

const log = createLogger('secureStore');

export async function getItemAsync(
  key: string,
  options?: ExpoSecureStore.SecureStoreOptions
): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    } catch (e) {
      log.warn('localStorage get failed:', e);
      return null;
    }
  }
  return ExpoSecureStore.getItemAsync(key, options);
}

export async function setItemAsync(
  key: string,
  value: string,
  options?: ExpoSecureStore.SecureStoreOptions
): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      log.warn('localStorage set failed:', e);
    }
    return;
  }
  return ExpoSecureStore.setItemAsync(key, value, options);
}

export async function deleteItemAsync(
  key: string,
  options?: ExpoSecureStore.SecureStoreOptions
): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {
      log.warn('localStorage delete failed:', e);
    }
    return;
  }
  return ExpoSecureStore.deleteItemAsync(key, options);
}

/**
 * adminApi.ts — Mobile-side HTTP client for the KutumbKosh admin server.
 *
 * All calls go to the admin Next.js server (configured via ADMIN_API_URL).
 * For development, this defaults to http://localhost:3000.
 */

import Constants from 'expo-constants';
import * as SecureStore from './secureStore';

// Set ADMIN_API_URL in app.json extra or as a build-time env var.
// Falls back to localhost for development.
const ADMIN_BASE_URL =
  (Constants.expoConfig?.extra?.adminApiUrl as string | undefined) ?? 'http://localhost:3000';

async function getAuthHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await SecureStore.getItemAsync('kk_session_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function apiFetch(path: string, body: Record<string, unknown>, useAuth = false) {
  const headers = useAuth ? await getAuthHeaders() : { 'Content-Type': 'application/json' };
  const res = await fetch(`${ADMIN_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({ error: 'Invalid server response.' }));

  if (!res.ok) {
    throw new Error(json.error ?? `Server error ${res.status}`);
  }

  return json;
}

// ─── Login (cross-device) ────────────────────────────────────────────────────

/**
 * Checks if the email is an approved user and retrieves their encrypted DB URL blob.
 * Returns null for encryptedDbUrl if the user hasn't uploaded it yet (first device).
 */
export async function fetchEncryptedDbUrl(
  email: string,
  masterPassword: string
): Promise<{ name: string; encryptedDbUrl: string | null }> {
  const data = await apiFetch('/api/mobile/login', { email, masterPassword }, false);
  if (data.token) {
    await SecureStore.setItemAsync('kk_session_token', data.token);
  }
  return { name: data.name, encryptedDbUrl: data.encryptedDbUrl ?? null };
}

// ─── Upload DB URL ───────────────────────────────────────────────────────────

/**
 * Uploads the client-AES-encrypted DB URL blob to the admin server after onboarding.
 * The server cannot decrypt this — it's encrypted with the user's master-password-derived key.
 */
export async function uploadEncryptedDbUrl(
  email: string,
  encryptedDbUrl: string
): Promise<void> {
  await apiFetch('/api/mobile/upload-db-url', { email, encryptedDbUrl }, true);
}

// ─── OTP Recovery ────────────────────────────────────────────────────────────

/**
 * Requests a 6-digit OTP to be sent to the user's registered email.
 * Always resolves (even if email isn't found) to prevent enumeration.
 */
export async function requestRecoveryOtp(email: string): Promise<void> {
  await apiFetch('/api/mobile/otp/request', { email });
}

/**
 * Verifies the OTP and triggers the admin server to send a recovery email
 * containing the master password. Throws if the OTP is invalid or expired.
 */
export async function verifyRecoveryOtp(email: string, otp: string): Promise<void> {
  await apiFetch('/api/mobile/otp/verify', { email, otp });
}

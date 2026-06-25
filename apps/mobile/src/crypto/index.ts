import * as Crypto from 'expo-crypto';
import * as SecureStore from '../utils/secureStore';
import { Buffer } from 'buffer';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';

const SALT_KEY = 'kk_salt_v1';
const DB_URL_KEY = 'kk_db_url_v1';
const DEVICE_ID_KEY = 'kk_device_id_v1';

// ─── Global Salt (cross-device) ───────────────────────────────────────────────
// A fixed salt used for the DB URL encryption that is uploaded to the server.
// This must be the same on every device so the same master password always
// produces the same key for encrypting/decrypting the server-stored DB URL blob.
// This is NOT the salt used for local device encryption (which is device-specific).
const GLOBAL_SALT_HEX = 'b9f1c3a72e4d6085af3b28c1e5f04792b6d3a8c7e2f0951483b7d6e4a5c9012f';

export type CryptoKey = Uint8Array;

// ─── Key Derivation ───────────────────────────────────────────────────────────

export async function getOrCreateSalt(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(SALT_KEY);
  if (existing) return Buffer.from(existing, 'hex');
  const salt = await Crypto.getRandomBytesAsync(16);
  await SecureStore.setItemAsync(SALT_KEY, Buffer.from(salt).toString('hex'));
  return salt;
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  // Pure JavaScript PBKDF2 that runs perfectly on Hermes React Native
  return await pbkdf2Async(sha256, password, salt, {
    c: 100_000,
    dkLen: 32
  });
}

/**
 * Derives a deterministic key from the master password using the global salt.
 * Used to encrypt the DB URL before uploading to the admin server, so the
 * same master password can decrypt the blob on any device.
 */
export async function deriveLoginKey(masterPassword: string): Promise<CryptoKey> {
  const globalSalt = Buffer.from(GLOBAL_SALT_HEX, 'hex');
  return await pbkdf2Async(sha256, masterPassword, globalSalt, {
    c: 100_000,
    dkLen: 32
  });
}

export async function verifyKey(key: CryptoKey): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync('kk_verify_token');
    if (!stored) return true; // first time setup
    const { iv, data } = JSON.parse(stored);
    const decrypted = await decrypt(key, { iv, data });
    return decrypted === 'kutumbkosh_verify_ok';
  } catch {
    return false;
  }
}

export async function storeVerifyToken(key: CryptoKey): Promise<void> {
  const encrypted = await encrypt(key, 'kutumbkosh_verify_ok');
  await SecureStore.setItemAsync('kk_verify_token', JSON.stringify(encrypted));
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────

export interface EncryptedBlob {
  iv: string;   // base64
  data: string; // base64
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  const iv = await Crypto.getRandomBytesAsync(12);
  const aesGcm = gcm(key, iv);
  const encoder = new TextEncoder();
  const encrypted = aesGcm.encrypt(encoder.encode(plaintext));
  return {
    iv: Buffer.from(iv).toString('base64'),
    data: Buffer.from(encrypted).toString('base64'),
  };
}

export async function decrypt(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const iv = Buffer.from(blob.iv, 'base64');
  const data = Buffer.from(blob.data, 'base64');
  const aesGcm = gcm(key, iv);
  const decrypted = aesGcm.decrypt(data);
  return new TextDecoder().decode(decrypted);
}

export function encryptRecord<T>(key: CryptoKey, record: T): Promise<EncryptedBlob> {
  return encrypt(key, JSON.stringify(record));
}

export async function decryptRecord<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  const json = await decrypt(key, blob);
  return JSON.parse(json) as T;
}

// ─── DB URL ───────────────────────────────────────────────────────────────────

export function enforceSSL(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!trimmed.includes('sslmode=')) {
    return trimmed.includes('?') ? `${trimmed}&sslmode=require` : `${trimmed}?sslmode=require`;
  }
  return trimmed;
}

export async function storeDBUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(DB_URL_KEY, enforceSSL(url));
}

export async function getDBUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(DB_URL_KEY);
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

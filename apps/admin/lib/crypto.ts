/**
 * Server-side AES-256-GCM crypto for KutumbKosh admin.
 * Used ONLY to encrypt/decrypt the master password for credential recovery.
 * The DB URL is NEVER decrypted server-side — it is stored as a client-encrypted blob.
 *
 * Requires env var: CREDENTIAL_SECRET (min 32 characters)
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getSecretKey(): Buffer {
  const secret = process.env.CREDENTIAL_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('CREDENTIAL_SECRET env var must be set and at least 32 characters long.');
  }
  // Derive a fixed 32-byte key from the secret using SHA-256
  return createHash('sha256').update(secret).digest();
}

export interface ServerEncryptedBlob {
  iv: string;   // hex
  tag: string;  // hex — GCM auth tag
  data: string; // hex
}

/**
 * Encrypts a plaintext string with the server CREDENTIAL_SECRET.
 */
export function serverEncrypt(plaintext: string): ServerEncryptedBlob {
  const key = getSecretKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

/**
 * Decrypts a blob that was encrypted with the server CREDENTIAL_SECRET.
 */
export function serverDecrypt(blob: ServerEncryptedBlob): string {
  const key = getSecretKey();
  const iv = Buffer.from(blob.iv, 'hex');
  const tag = Buffer.from(blob.tag, 'hex');
  const data = Buffer.from(blob.data, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Serialise/deserialise blob to a single string for DB storage.
 */
export function blobToString(blob: ServerEncryptedBlob): string {
  return JSON.stringify(blob);
}

export function stringToBlob(str: string): ServerEncryptedBlob {
  return JSON.parse(str) as ServerEncryptedBlob;
}

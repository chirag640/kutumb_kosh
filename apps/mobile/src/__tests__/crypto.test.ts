import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOrCreateSalt,
  deriveKey,
  deriveLoginKey,
  verifyKey,
  storeVerifyToken,
  encrypt,
  decrypt,
  encryptRecord,
  decryptRecord,
  enforceSSL,
  storeDBUrl,
  getDBUrl,
  getOrCreateDeviceId,
} from '../crypto';
import { resetTestMocks } from './setup';

describe('Crypto Utility Functions', () => {
  beforeEach(() => {
    resetTestMocks();
  });

  describe('Salt and Device ID Generation', () => {
    it('should generate a new salt if none exists, and reuse it subsequently', async () => {
      const salt1 = await getOrCreateSalt();
      expect(salt1).toBeInstanceOf(Uint8Array);
      expect(salt1.length).toBe(16);

      const salt2 = await getOrCreateSalt();
      expect(Buffer.from(salt2).toString('hex')).toBe(Buffer.from(salt1).toString('hex'));
    });

    it('should generate a new device id if none exists, and reuse it subsequently', async () => {
      const id1 = await getOrCreateDeviceId();
      expect(id1).toBe('12345678-1234-1234-1234-1234567890ab');

      const id2 = await getOrCreateDeviceId();
      expect(id2).toBe(id1);
    });
  });

  describe('Key Derivation', () => {
    it('should derive a 32-byte key from password and salt', async () => {
      const password = 'my-super-secret-password';
      const salt = new Uint8Array(16).fill(9);

      const key = await deriveKey(password, salt);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should deterministically derive login key using global salt', async () => {
      const password = 'my-super-secret-password';
      const key1 = await deriveLoginKey(password);
      const key2 = await deriveLoginKey(password);

      expect(key1).toBeInstanceOf(Uint8Array);
      expect(key1.length).toBe(32);
      expect(key1).toStrictEqual(key2);
    });
  });

  describe('Encryption & Decryption', () => {
    it('should encrypt and decrypt a plaintext string correctly', async () => {
      const password = 'password123';
      const salt = await getOrCreateSalt();
      const key = await deriveKey(password, salt);

      const plaintext = 'Secret Family Treasury Data';
      const encrypted = await encrypt(key, plaintext);

      expect(encrypted.iv).toBeDefined();
      expect(encrypted.data).toBeDefined();

      const decrypted = await decrypt(key, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt records (objects) correctly', async () => {
      const password = 'password123';
      const salt = await getOrCreateSalt();
      const key = await deriveKey(password, salt);

      const record = { localId: '123', amount: 5000, desc: 'Grocery purchase' };
      const encrypted = await encryptRecord(key, record);
      const decrypted = await decryptRecord<typeof record>(key, encrypted);

      expect(decrypted).toEqual(record);
    });

    it('should fail to decrypt with an incorrect key', async () => {
      const salt = await getOrCreateSalt();
      const key1 = await deriveKey('correct-password', salt);
      const key2 = await deriveKey('wrong-password', salt);

      const plaintext = 'Secret Message';
      const encrypted = await encrypt(key1, plaintext);

      await expect(decrypt(key2, encrypted)).rejects.toThrow();
    });
  });

  describe('Verification Token', () => {
    it('should verify key successfully after storing verify token', async () => {
      const salt = await getOrCreateSalt();
      const key = await deriveKey('master-pass', salt);

      // Verify token doesn't exist yet, should return true (first time setup)
      const initCheck = await verifyKey(key);
      expect(initCheck).toBe(true);

      // Store verification token
      await storeVerifyToken(key);

      // Now verify again with correct key
      const correctCheck = await verifyKey(key);
      expect(correctCheck).toBe(true);

      // Verify with incorrect key
      const wrongKey = await deriveKey('wrong-pass', salt);
      const wrongCheck = await verifyKey(wrongKey);
      expect(wrongCheck).toBe(false);
    });
  });

  describe('SSL Enforcement and DB URL Storage', () => {
    it('should append sslmode=require to URLs correctly', () => {
      expect(enforceSSL('postgres://user:pass@host:5432/db')).toBe('postgres://user:pass@host:5432/db?sslmode=require');
      expect(enforceSSL('postgres://user:pass@host:5432/db?someparam=val')).toBe('postgres://user:pass@host:5432/db?someparam=val&sslmode=require');
      expect(enforceSSL('postgres://user:pass@host:5432/db?sslmode=require')).toBe('postgres://user:pass@host:5432/db?sslmode=require');
      expect(enforceSSL('')).toBe('');
    });

    it('should store and get DB URL with SSL mode enforced', async () => {
      const originalUrl = 'postgres://user:pass@host:5432/db';
      await storeDBUrl(originalUrl);

      const storedUrl = await getDBUrl();
      expect(storedUrl).toBe('postgres://user:pass@host:5432/db?sslmode=require');
    });
  });
});

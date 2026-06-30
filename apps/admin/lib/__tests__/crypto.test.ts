import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV, CREDENTIAL_SECRET: 'test-secret-that-is-at-least-32-chars-long!!' };
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe('serverEncrypt / serverDecrypt', () => {
  it('encrypts and decrypts a string', async () => {
    const { serverEncrypt, serverDecrypt } = await import('../crypto');

    const plaintext = 'my-secret-password-123';
    const blob = serverEncrypt(plaintext);

    expect(blob.iv).toBeTruthy();
    expect(blob.tag).toBeTruthy();
    expect(blob.data).toBeTruthy();
    expect(blob.iv).not.toBe(plaintext);

    const decrypted = serverDecrypt(blob);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (unique IV)', async () => {
    const { serverEncrypt } = await import('../crypto');

    const plaintext = 'same-text';
    const blob1 = serverEncrypt(plaintext);
    const blob2 = serverEncrypt(plaintext);

    // IV and data should differ because of random IV
    expect(blob1.iv).not.toBe(blob2.iv);
    expect(blob1.data).not.toBe(blob2.data);
  });

  it('handles empty string', async () => {
    const { serverEncrypt, serverDecrypt } = await import('../crypto');

    const blob = serverEncrypt('');
    const decrypted = serverDecrypt(blob);
    expect(decrypted).toBe('');
  });

  it('fails to decrypt with wrong key', async () => {
    const { serverEncrypt, serverDecrypt } = await import('../crypto');

    const blob = serverEncrypt('secret');

    // getSecretKey() reads CREDENTIAL_SECRET at runtime — no re-import needed
    process.env.CREDENTIAL_SECRET = 'a-different-secret-that-is-32-chars-long!!!';

    expect(() => serverDecrypt(blob)).toThrow();
  });

  it('fails with tampered ciphertext', async () => {
    const { serverEncrypt, serverDecrypt } = await import('../crypto');

    const blob = serverEncrypt('important');
    blob.data = blob.data.replace(/^../, 'ff'); // corrupt first byte

    expect(() => serverDecrypt(blob)).toThrow();
  });
});

describe('blobToString / stringToBlob', () => {
  it('serialises and deserialises a blob', async () => {
    const { serverEncrypt, blobToString, stringToBlob, serverDecrypt } = await import('../crypto');

    const original = serverEncrypt('roundtrip');
    const str = blobToString(original);
    expect(typeof str).toBe('string');

    const restored = stringToBlob(str);
    expect(restored).toEqual(original);

    const decrypted = serverDecrypt(restored);
    expect(decrypted).toBe('roundtrip');
  });
});

describe('CREDENTIAL_SECRET validation', () => {
  it('throws if CREDENTIAL_SECRET is missing', async () => {
    delete process.env.CREDENTIAL_SECRET;
    const { serverEncrypt } = await import('../crypto');
    expect(() => serverEncrypt('test')).toThrow('CREDENTIAL_SECRET');
  });

  it('throws if CREDENTIAL_SECRET is too short', async () => {
    process.env.CREDENTIAL_SECRET = 'short';
    const { serverEncrypt } = await import('../crypto');
    expect(() => serverEncrypt('test')).toThrow('at least 32 characters');
  });
});

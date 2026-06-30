import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OLD_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://test:test@localhost:5432/test', ADMIN_EMAIL: 'admin@test.com', ADMIN_PASSWORD: 'password123' };
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe('signToken / verifyToken', () => {
  it('signs and verifies a valid token', async () => {
    // Need to mock NEXTAUTH_SECRET before importing jwt (which calls getEnv())
    process.env.NEXTAUTH_SECRET = 'super-secret-key-123456';

    const { signToken, verifyToken } = await import('../jwt');
    const payload = { userId: 'u1', email: 'user@test.com' };

    const token = signToken(payload, 1); // 1 day
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe('u1');
    expect(decoded!.email).toBe('user@test.com');
    expect(decoded!.exp).toBeGreaterThan(0);
  });

  it('rejects a tampered token', async () => {
    process.env.NEXTAUTH_SECRET = 'super-secret-key-123456';

    const { signToken, verifyToken } = await import('../jwt');
    const token = signToken({ userId: 'u1', email: 'user@test.com' });

    // Tamper with the payload portion
    const parts = token.split('.');
    const tampered = [parts[0], 'eyJpZCI6ImgyY2tlciJ9', parts[2]].join('.');

    const decoded = verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  it('rejects a token with wrong secret', async () => {
    process.env.NEXTAUTH_SECRET = 'super-secret-key-123456';
    const { signToken } = await import('../jwt');
    const token = signToken({ userId: 'u1', email: 'user@test.com' });

    // Reset module cache so the next import re-reads NEXTAUTH_SECRET
    vi.resetModules();
    process.env.NEXTAUTH_SECRET = 'different-secret-key-99999';
    const { verifyToken } = await import('../jwt');

    const decoded = verifyToken(token);
    expect(decoded).toBeNull();
  });

  it('rejects an expired token', async () => {
    process.env.NEXTAUTH_SECRET = 'super-secret-key-123456';

    const { signToken, verifyToken } = await import('../jwt');
    // -1 days = signed in the past, definitely expired
    const token = signToken({ userId: 'u1', email: 'user@test.com' }, -1);

    const decoded = verifyToken(token);
    expect(decoded).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    process.env.NEXTAUTH_SECRET = 'super-secret-key-123456';

    const { verifyToken } = await import('../jwt');

    expect(verifyToken('not-a-jwt')).toBeNull();
    expect(verifyToken('a.b')).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('a.b.c.d')).toBeNull();
  });

  it('includes optional role in payload', async () => {
    process.env.NEXTAUTH_SECRET = 'super-secret-key-123456';

    const { signToken, verifyToken } = await import('../jwt');
    const token = signToken({ userId: 'u1', email: 'admin@test.com', role: 'admin' });
    const decoded = verifyToken(token);
    expect(decoded!.role).toBe('admin');
  });
});

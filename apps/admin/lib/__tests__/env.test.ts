import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OLD_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
});

function setRequiredEnv() {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  process.env.NEXTAUTH_SECRET = 'super-secret-key-16c';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_PASSWORD = 'password123';
}

describe('getEnv', () => {
  it('returns parsed env when all required vars are present', async () => {
    setRequiredEnv();
    process.env.NODE_ENV = 'development';

    const { getEnv } = await import('../env');
    const env = getEnv();

    expect(env.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/db');
    expect(env.NEXTAUTH_SECRET).toBe('super-secret-key-16c');
    expect(env.ADMIN_EMAIL).toBe('admin@example.com');
    expect(env.ADMIN_PASSWORD).toBe('password123');
  });

  it('defaults NODE_ENV to development', async () => {
    setRequiredEnv();
    delete process.env.NODE_ENV; // Vitest sets NODE_ENV=test; remove so Zod default kicks in

    const { getEnv } = await import('../env');
    const env = getEnv();

    expect(env.NODE_ENV).toBe('development');
  });

  it('accepts optional SMTP vars', async () => {
    setRequiredEnv();
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';

    const { getEnv } = await import('../env');
    const env = getEnv();

    expect(env.SMTP_HOST).toBe('smtp.example.com');
    expect(env.SMTP_PORT).toBe('587');
  });

  it('caches result after first call', async () => {
    setRequiredEnv();

    const { getEnv } = await import('../env');
    const env1 = getEnv();

    // Remove a required var and verify the cache returns the original
    delete process.env.DATABASE_URL;
    const env2 = getEnv();

    expect(env2.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/db');
  });
});

describe('getEnv validation errors', () => {
  it('throws if DATABASE_URL is missing', async () => {
    process.env.NEXTAUTH_SECRET = 'super-secret-key-16c';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'password123';

    const { getEnv } = await import('../env');
    expect(() => getEnv()).toThrow();
  });

  it('throws if DATABASE_URL is not a valid URL', async () => {
    process.env.DATABASE_URL = 'not-a-url';
    process.env.NEXTAUTH_SECRET = 'super-secret-key-16c';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'password123';

    const { getEnv } = await import('../env');
    expect(() => getEnv()).toThrow();
  });

  it('throws if NEXTAUTH_SECRET is too short', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.NEXTAUTH_SECRET = 'short';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'password123';

    const { getEnv } = await import('../env');
    expect(() => getEnv()).toThrow();
  });

  it('throws if ADMIN_EMAIL is invalid', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.NEXTAUTH_SECRET = 'super-secret-key-16c';
    process.env.ADMIN_EMAIL = 'not-an-email';
    process.env.ADMIN_PASSWORD = 'password123';

    const { getEnv } = await import('../env');
    expect(() => getEnv()).toThrow();
  });

  it('throws if ADMIN_PASSWORD is too short', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.NEXTAUTH_SECRET = 'super-secret-key-16c';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = '123';

    const { getEnv } = await import('../env');
    expect(() => getEnv()).toThrow();
  });
});

describe('isSmtpConfigured', () => {
  it('returns true when SMTP_USER and SMTP_PASS are set', async () => {
    setRequiredEnv();
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';

    const { isSmtpConfigured } = await import('../env');
    expect(isSmtpConfigured()).toBe(true);
  });

  it('returns false when SMTP vars are missing', async () => {
    vi.resetModules();
    setRequiredEnv();
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const { isSmtpConfigured } = await import('../env');
    expect(isSmtpConfigured()).toBe(false);
  });
});

describe('isProduction', () => {
  it('returns true when NODE_ENV is production', async () => {
    setRequiredEnv();
    process.env.NODE_ENV = 'production';

    const { isProduction } = await import('../env');
    expect(isProduction()).toBe(true);
  });

  it('returns false in development', async () => {
    setRequiredEnv();
    process.env.NODE_ENV = 'development';

    const { isProduction } = await import('../env');
    expect(isProduction()).toBe(false);
  });
});

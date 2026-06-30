import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Preserve original env so we can restore it
const OLD_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe('createLogger', () => {
  it('logs debug messages in development', async () => {
    process.env.NODE_ENV = 'development';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { createLogger } = await import('../logger');
    const log = createLogger('test');
    log.debug('hello');

    expect(consoleSpy).toHaveBeenCalledOnce();
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('DEBUG');
    expect(output).toContain('hello');
    expect(output).toContain('[test]');

    consoleSpy.mockRestore();
  });

  it('suppresses debug in production', async () => {
    process.env.NODE_ENV = 'production';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { createLogger } = await import('../logger');
    const log = createLogger('test');
    log.debug('should not appear');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs info in production', async () => {
    process.env.NODE_ENV = 'production';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { createLogger } = await import('../logger');
    const log = createLogger('test');
    log.info('important');

    expect(consoleSpy).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('formats as JSON in production', async () => {
    process.env.NODE_ENV = 'production';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { createLogger } = await import('../logger');
    const log = createLogger('app');
    log.info('startup', { version: '1.0' });

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('startup');
    expect(parsed.ctx).toBe('app');
    expect(parsed.version).toBe('1.0');
    expect(parsed).toHaveProperty('timestamp');

    consoleSpy.mockRestore();
  });

  it('logs warn messages', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { createLogger } = await import('../logger');
    const log = createLogger('test');
    log.warn('warning');

    expect(consoleWarn).toHaveBeenCalledOnce();
    consoleWarn.mockRestore();
  });

  it('logs error messages', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { createLogger } = await import('../logger');
    const log = createLogger('test');
    log.error('failure', { code: 500 });

    expect(consoleError).toHaveBeenCalledOnce();
    const output = consoleError.mock.calls[0][0];
    expect(output).toContain('failure');
    expect(output).toContain('500');

    consoleError.mockRestore();
  });

  it('respects custom LOG_LEVEL', async () => {
    process.env.LOG_LEVEL = 'error';
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { createLogger } = await import('../logger');
    const log = createLogger('test');
    log.info('should be suppressed');
    log.error('should appear');

    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });
});

describe('root logger', () => {
  it('logs without a context tag', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { logger } = await import('../logger');
    logger.info('root msg');

    const output = consoleSpy.mock.calls[0][0];
    // No [ctx] prefix in the output
    expect(output).not.toMatch(/\[\w+\]/);

    consoleSpy.mockRestore();
  });
});

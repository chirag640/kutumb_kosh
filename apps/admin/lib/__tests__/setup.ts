/**
 * Vitest setup for KutumbKosh admin app.
 * Provides mocks for Next.js modules that aren't available in a Node test environment.
 */

import { vi } from 'vitest';

// ─── Mock NextResponse ──────────────────────────────────────────────────────
// The real NextResponse is a Web Response subclass with Next.js-specific
// extensions. We mock it with a simple factory that returns a plain object
// matching the interface our code actually uses.

vi.mock('next/server', () => {
  const MockNextResponse = {
    json: vi.fn((body: unknown, init?: ResponseInit) => {
      const status = (init as { status?: number })?.status ?? 200;
      return {
        status,
        body: JSON.stringify(body),
        headers: new Headers(init?.headers),
        json: () => Promise.resolve(body),
      };
    }),
  };
  return { NextResponse: MockNextResponse };
});

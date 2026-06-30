/**
 * Database-backed rate limiter for KutumbKosh admin server.
 *
 * Uses a fixed-window counter stored in Postgres via Drizzle ORM.
 * Survives server restarts, cold starts, and multi-instance deployments.
 *
 * Periodic cleanup removes expired entries to prevent table bloat.
 */

import { db } from '@/lib/db';
import { rateLimits } from '@/lib/db/schema';
import { eq, and, lt, gte } from 'drizzle-orm';

// Periodic cleanup every 5 minutes to prevent table bloat
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = 0;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Database-backed rate limiter using a fixed window counter.
 *
 * @param key      Unique identifier (e.g. IP address, email)
 * @param limit    Maximum requests allowed in the window
 * @param windowMs Time window in milliseconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // 1. Periodically clean up expired entries (runs at most every 5 minutes)
  if (now.getTime() - lastCleanup > CLEANUP_INTERVAL_MS) {
    await db.delete(rateLimits).where(lt(rateLimits.expiresAt, now));
    lastCleanup = now.getTime();
  }

  // 2. Look for an existing window for this key
  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.key, key),
        gte(rateLimits.windowStart, windowStart)
      )
    )
    .limit(1);

  if (!existing) {
    // 3a. First request in this window — create a new entry
    const expiresAt = new Date(now.getTime() + windowMs);
    await db.insert(rateLimits).values({
      key,
      count: 1,
      limitVal: limit,
      windowStart: now,
      expiresAt,
    });

    return {
      success: true,
      limit,
      remaining: limit - 1,
      resetAt: expiresAt.getTime(),
    };
  }

  if (existing.count >= limit) {
    // 3b. Window full — rate limited
    return {
      success: false,
      limit,
      remaining: 0,
      resetAt: existing.expiresAt.getTime(),
    };
  }

  // 3c. Within window — increment counter
  await db
    .update(rateLimits)
    .set({ count: existing.count + 1 })
    .where(eq(rateLimits.id, existing.id));

  return {
    success: true,
    limit,
    remaining: limit - (existing.count + 1),
    resetAt: existing.expiresAt.getTime(),
  };
}

/**
 * Reset rate limit for a specific key (useful after successful actions).
 */
export async function resetRateLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

const trackers = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Basic in-memory rate limiter for serverless or dev hosting.
 * Key should be unique (e.g. IP address or Email address).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const tracker = trackers.get(key);

  if (!tracker || now > tracker.resetAt) {
    const newTracker = { count: 1, resetAt: now + windowMs };
    trackers.set(key, newTracker);
    return { success: true, limit, remaining: limit - 1, resetAt: newTracker.resetAt };
  }

  if (tracker.count >= limit) {
    return { success: false, limit, remaining: 0, resetAt: tracker.resetAt };
  }

  tracker.count += 1;
  return { success: true, limit, remaining: limit - tracker.count, resetAt: tracker.resetAt };
}

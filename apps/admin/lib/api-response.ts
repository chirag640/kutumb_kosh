/**
 * Standardized API response utilities for KutumbKosh admin server.
 * Ensures consistent response format across all API endpoints.
 *
 * Success response:
 *   { success: true, data: { ... }, message?: string }
 *
 * Error response:
 *   { success: false, error: { code: string, message: string }, details?: unknown }
 */

import { NextResponse } from 'next/server';

// ─── Standardized success response ──────────────────────────────────────────

export function apiSuccess<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message ? { message } : {}),
    },
    { status }
  );
}

// ─── Standardized error response ────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
}

export function apiError(
  code: string,
  message: string,
  status: number = 400,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      ...(details !== undefined ? { details } : {}),
    },
    { status }
  );
}

// ─── Common error factories ─────────────────────────────────────────────────

export function apiUnauthorized(message = 'Unauthorized.'): NextResponse {
  return apiError('UNAUTHORIZED', message, 401);
}

export function apiForbidden(message = 'Forbidden.'): NextResponse {
  return apiError('FORBIDDEN', message, 403);
}

export function apiNotFound(message = 'Resource not found.'): NextResponse {
  return apiError('NOT_FOUND', message, 404);
}

export function apiRateLimited(message = 'Too many requests. Please try again later.'): NextResponse {
  return apiError('RATE_LIMITED', message, 429);
}

export function apiServerError(err?: unknown): NextResponse {
  const message = err instanceof Error ? err.message : 'Internal server error.';
  // Note: logger is not imported here to avoid circular deps; callers should log before calling this
  return apiError('INTERNAL_ERROR', 'Internal server error.', 500);
}

export function apiValidationError(message: string, details?: unknown): NextResponse {
  return apiError('VALIDATION_ERROR', message, 400, details);
}

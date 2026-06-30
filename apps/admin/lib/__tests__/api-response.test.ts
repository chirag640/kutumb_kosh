import { describe, it, expect } from 'vitest';

const mod = await import('../api-response');

describe('apiSuccess', () => {
  it('returns 200 with success:true and data', () => {
    const res = mod.apiSuccess({ userId: 'abc' });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ userId: 'abc' });
  });

  it('includes message when provided', () => {
    const res = mod.apiSuccess(null, 'Operation completed');
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Operation completed');
  });

  it('omits message key when not provided', () => {
    const res = mod.apiSuccess({});
    const body = JSON.parse(res.body);
    expect(body).not.toHaveProperty('message');
  });

  it('uses custom status code', () => {
    const res = mod.apiSuccess({}, undefined, 201);
    expect(res.status).toBe(201);
  });
});

describe('apiError', () => {
  it('returns error object with code and message', () => {
    const res = mod.apiError('NOT_FOUND', 'User not found', 404);
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'User not found' });
  });

  it('includes details when provided', () => {
    const res = mod.apiError('VALIDATION_ERROR', 'Invalid input', 400, { field: 'email' });
    const body = JSON.parse(res.body);
    expect(body.details).toEqual({ field: 'email' });
  });

  it('defaults to 400', () => {
    const res = mod.apiError('BAD_REQUEST', 'Bad request');
    expect(res.status).toBe(400);
  });
});

describe('apiUnauthorized', () => {
  it('returns 401 with UNAUTHORIZED code', () => {
    const res = mod.apiUnauthorized();
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('uses custom message', () => {
    const res = mod.apiUnauthorized('Token expired');
    const body = JSON.parse(res.body);
    expect(body.error.message).toBe('Token expired');
  });
});

describe('apiForbidden', () => {
  it('returns 403 with FORBIDDEN code', () => {
    const res = mod.apiForbidden();
    expect(res.status).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('apiNotFound', () => {
  it('returns 404 with NOT_FOUND code', () => {
    const res = mod.apiNotFound();
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('apiRateLimited', () => {
  it('returns 429 with RATE_LIMITED code', () => {
    const res = mod.apiRateLimited();
    expect(res.status).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});

describe('apiServerError', () => {
  it('returns 500 with generic message (never leaks details)', () => {
    const res = mod.apiServerError(new Error('DB credentials leaked'));
    expect(res.status).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error.');
  });

  it('handles unknown error gracefully', () => {
    const res = mod.apiServerError();
    expect(res.status).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.message).toBe('Internal server error.');
  });
});

describe('apiValidationError', () => {
  it('returns 400 with VALIDATION_ERROR code', () => {
    const res = mod.apiValidationError('Email is required');
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('includes validation details', () => {
    const res = mod.apiValidationError('Invalid fields', ['email', 'name']);
    const body = JSON.parse(res.body);
    expect(body.details).toEqual(['email', 'name']);
  });
});

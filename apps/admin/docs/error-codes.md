# KutumbKosh API — Error Code Reference

> **Companion to:** `api-spec.yaml`
> **Last updated:** June 27, 2026

## Standardized Response Format

All API responses follow this structure:

```json
// Success (2xx)
{ "success": true, "data": { ... }, "message": "optional" }

// Error (4xx/5xx)
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." }, "details": {} }
```

## Error Codes

| HTTP | Code | Description | Likely Cause |
|------|------|-------------|-------------|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation | Missing required field, invalid email format, etc. |
| 400 | `CREDENTIALS_NOT_INITIALIZED` | Master password hash not set | Admin hasn't resent credentials yet |
| 400 | `NO_OTP_REQUESTED` | No OTP was issued for this user | Missing `/otp/request` call |
| 400 | `OTP_EXPIRED` | OTP window (10 min) expired | User took too long |
| 400 | `INVALID_OTP` | OTP doesn't match the stored hash | Typo or wrong code |
| 401 | `UNAUTHORIZED` | Missing/invalid/expired JWT | Bad `Authorization` header or expired token |
| 401 | `AUTH_FAILED` | Invalid email or password | Generic error to prevent email enumeration |
| 403 | `FORBIDDEN` | Identity mismatch or insufficient permissions | Token email doesn't match request email |
| 403 | `ACCOUNT_SUSPENDED` | User has been suspended by admin | Admin action |
| 403 | `ACCOUNT_NOT_APPROVED` | User's status is still "pending" | Awaiting admin approval |
| 404 | `NOT_FOUND` | Resource (user, account) not found | Invalid email or deleted user |
| 429 | `RATE_LIMITED` | Rate limit exceeded | Too many requests in the sliding window |
| 500 | `INTERNAL_ERROR` | Unhandled server error | Server misconfiguration or bug (details NEVER leaked) |
| 503 | `SMTP_NOT_CONFIGURED` | OTP endpoint called without SMTP | Missing SMTP env vars |

## Rate Limiting

All endpoints use DB-backed sliding window rate limiting.

| Endpoint | Key | Limit | Window |
|----------|-----|-------|--------|
| `POST /api/mobile/login` | IP | 5 | 15 min |
| `POST /api/mobile/otp/request` | IP | 5 | 15 min |
| `POST /api/mobile/otp/verify` | IP + Email | 5 each | 15 min |
| `POST /api/mobile/upload-db-url` | — | — | Not rate-limited (JWT-protected) |

Rate limit entries are auto-cleaned 30 minutes after their window expires to
prevent table bloat.

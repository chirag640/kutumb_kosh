# API Review: KutumbKosh

> [!NOTE]
> **Update (June 30, 2026):** All input validation, CORS, rate limiting, and documentation findings identified in this review have been fully resolved in the subsequent security and optimization passes. See [MASTER_IMPLEMENTATION_STATUS.md](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/MASTER_IMPLEMENTATION_STATUS.md) for validation details.

> Generated: June 26, 2026  
> Scope: Admin Next.js API routes

---

## API Score: 7.5/10

| Category | Score | Notes |
|---|---|---|
| Endpoint Design | 7/10 | RESTful, but inconsistent response formats |
| Authentication | 8/10 | JWT + NextAuth, well-configured |
| Authorization | 6/10 | Single role, no granular permissions |
| Validation | 5/10 | Minimal input validation, no schema validation |
| Error Handling | 7/10 | Consistent error responses, but some unhandled cases |
| Rate Limiting | 6/10 | In-memory, resets on restart |
| Documentation | 3/10 | No OpenAPI/Swagger, minimal inline docs |

---

## Endpoint Inventory

### Admin Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /api/mobile/login | Rate-limited | Verify master password, return JWT + encrypted DB URL |
| POST | /api/mobile/upload-db-url | JWT Required | Store encrypted DB URL blob |
| POST | /api/mobile/otp/request | Rate-limited | Send OTP for credential recovery |
| POST | /api/mobile/otp/verify | Rate-limited | Verify OTP, send recovery email |
| POST | /api/auth/[...nextauth] | NextAuth | Admin login via NextAuth |
| POST | / (server action) | Session | Register user (public) |
| POST | /users/actions (server action) | Session | approveUser, rejectUser, resendCredentials, toggleUserSuspension |

---

## Detailed Endpoint Review

### POST `/api/mobile/login`

**Request:**
```json
{ "email": "user@example.com", "masterPassword": "KK-xxxxxxxxxxxx" }
```

**Response (200):**
```json
{ "success": true, "name": "User Name", "encryptedDbUrl": "{\"iv\":\"...\",\"data\":\"...\"}", "token": "jwt..." }
```

**Response (401):**
```json
{ "error": "Invalid email or master password." }
```

**Issues:**
- ✅ Rate limited (5 requests per 15 min per IP)
- ✅ Generic error messages (no email enumeration)
- ⚠️ No rate limiting on email (IP-only)
- ⚠️ `bcrypt.compare` is synchronous - using it in async context is fine but blocks the event loop

### POST `/api/mobile/upload-db-url`

**Request:**
```json
{ "email": "user@example.com", "encryptedDbUrl": "{\"iv\":\"...\",\"data\":\"...\"}" }
```

**Headers:** `Authorization: Bearer <jwt>`

**Issues:**
- ✅ JWT required and validated
- ✅ Token email matches request email
- ✅ `encryptedDbUrl` length validated (< 4096 chars)
- ⚠️ No `Content-Type` validation for JSON body

### POST `/api/mobile/otp/request`

**Request:**
```json
{ "email": "user@example.com" }
```

**Issues:**
- ✅ Rate limited (5 requests per 15 min per IP)
- ✅ Generic response to prevent email enumeration
- ✅ Audit log entry created
- ⚠️ No email rate limiting (IP only) - multiple users on same IP could be blocked

### POST `/api/mobile/otp/verify`

**Request:**
```json
{ "email": "user@example.com", "otp": "123456" }
```

**Issues:**
- ✅ Rate limited (IP + Email, 5 attempts per 15 min)
- ✅ OTP expiry checked (10 min window)
- ✅ OTP cleared after use
- ✅ Audit log entry created
- ⚠️ Response reveals if email exists in "No approved account found for this email"

### POST `/api/auth/[...nextauth]`

**Issues:**
- ✅ Credentials provider with env var comparison
- ✅ JWT sessions with role embedded
- ⚠️ Single admin user (ADMIN_EMAIL / ADMIN_PASSWORD)
- ⚠️ Password compared directly (not hashed)
- ⚠️ No brute force protection on this endpoint

---

## Server Actions (Admin)

| Action | Purpose | Input Validation | Error Handling |
|---|---|---|---|
| `approveUser` | Approve + send welcome email | Minimal | ✅ Good |
| `rejectUser` | Reject registration | None needed | ✅ Good |
| `registerUser` | Public registration form | Minimal | ✅ Good |
| `resendCredentials` | Regenerate + resend password | None needed | ✅ Good |
| `toggleUserSuspension` | Suspend/unsuspend | None needed | ✅ Good |

---

## API Response Format Inconsistencies

### Mobile API Routes
```typescript
// Success
{ success: true, name: "...", encryptedDbUrl: "...", token: "..." }

// Error
{ error: "Error message" }

// Success without data
{ success: true }
```

### Server Actions
```typescript
// Success
{ success: true, masterPassword: "...", emailId: "..." }

// Error
{ error: "Error message" }

// Partial success
{ success: true, masterPassword: "...", emailWarning: "..." }
```

**Issue:** Inconsistent format. Some use `success: true`, others just return data.  
**Recommendation:** Standardize on:
```typescript
// Success
{ data: { ... }, message: "optional message" }

// Error
{ error: { code: "ERROR_CODE", message: "Human readable" } }
```

---

## Missing Endpoints

| Endpoint | Purpose | Priority |
|---|---|---|
| `GET /api/admin/stats` | Dashboard statistics | 🟡 Medium |
| `GET /api/admin/users?page=1&limit=20` | Paginated user list | 🟠 High |
| `GET /api/admin/audit-logs?page=1&limit=50` | Paginated audit logs | 🟡 Medium |
| `GET /api/health` | Health check endpoint | 🟢 Low |
| `GET /api/admin/sync-stats` | Aggregate sync statistics | 🟢 Low |

---

## Input Validation Gap

**Current:** Manual validation checks (if/throw)  
**Recommended:** Zod schema validation for all endpoints

Example:
```typescript
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email().transform(e => e.toLowerCase().trim()),
  masterPassword: z.string().min(8).max(100),
});

// In route handler:
const parsed = loginSchema.parse(await req.json());
```

---

## Rate Limiting Improvements

### Current
- In-memory Map (lost on restart)
- IP-based only (except OTP verify)
- 5 requests per 15 minutes

### Recommended
```typescript
// Option 1: Database-backed (PostgreSQL)
const result = await db.query(
  `INSERT INTO rate_limits (key, count, window_start) 
   VALUES ($1, 1, NOW()) 
   ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
   WHERE rate_limits.count < 5
   RETURNING count`,
  [`login-${identifier}`]
);

// Option 2: Use Upstash Redis (preferred for Vercel/edge)
```

---

## API Documentation

Current state: No API documentation exists.

**Recommendation:** Generate OpenAPI 3.0 specification:
- Use `zod-to-openapi` to generate from Zod schemas
- Generate Swagger UI accessible at `/api/docs`
- Document all endpoints with request/response examples

---

## API Security Checklist

| Security Measure | Status | Notes |
|---|---|---|
| HTTPS | ⚠️ Partial | Should enforce in next.config.mjs |
| Rate Limiting | ✅ Basic | In-memory, needs DB-backed |
| Input Validation | ⚠️ Minimal | Needs Zod integration |
| SQL Injection | ✅ Safe | Drizzle ORM + parameterized queries |
| XSS Protection | ✅ Built-in | React/Next.js auto-escapes |
| CSRF Protection | ⚠️ Partial | NextAuth provides for auth routes only |
| JWT Token Rotation | ❌ Missing | Tokens valid for 7 days |
| Audit Logging | ✅ Good | All admin actions logged |
| Error Leakage | ✅ Good | Generic error messages |
| CORS | ❌ Not configured | May cause issues for cross-origin requests |
| HTTP Headers | ⚠️ Partial | Add Helmet.js or Next.js security headers |

---

## Conclusion

The API layer is functional and generally secure, but lacks several production-readiness features:
1. **Standardized response format** across all endpoints
2. **Zod validation** for all inputs
3. **Database-backed rate limiting** for scalability
4. **Pagination** for list endpoints
5. **OpenAPI documentation**
6. **CORS configuration** and security headers

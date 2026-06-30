# Security Audit: KutumbKosh

> [!NOTE]
> **Update (June 30, 2026):** All High and Medium security vulnerabilities (including hardcoded fallback JWT secrets, console OTP log leakage, silent PIN default resets, in-memory rate limiting, missing Zod validation, CORS configuration, and CSRF token/origin validation) have been resolved. See [MASTER_IMPLEMENTATION_STATUS.md](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/MASTER_IMPLEMENTATION_STATUS.md) for details.

> Generated: June 26, 2026  
> Classification: Internal - Confidential

---

## Security Score: 8.5/10

Overall, KutumbKosh demonstrates strong security awareness with its zero-knowledge architecture. The end-to-end encryption model is well-implemented. However, several configuration and implementation issues should be addressed.

---

## Summary of Findings

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 3 |
| Medium | 5 |
| Low | 4 |
| Info | 3 |

---

## CRITICAL FINDINGS

*None.* The zero-knowledge architecture prevents the most critical classes of vulnerabilities.

---

## HIGH FINDINGS

### H1. Hardcoded JWT Fallback Secret
**File:** `apps/admin/lib/jwt.ts`  
**Severity:** High  
**CWE:** CWE-798 (Use of Hardcoded Credentials)

```typescript
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'default-fallback-secret-for-jwt-tokens-32-chars';
```

**Impact:** Anyone who reads the source code can forge JWT tokens if the fallback is used. The fallback string is 32+ characters but publicly visible.

**Risk:** Low in practice because NEXTAUTH_SECRET is likely set in production, but the fallback creates a false sense of security.

**Recommendation:** Remove the fallback and throw an error:
```typescript
if (!process.env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET environment variable is required');
```

### H2. OTP Printed to Console on SMTP Failure
**File:** `apps/admin/lib/email/otp.ts`  
**Severity:** High  
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

```typescript
console.warn(`OTP Code:   ${otp}`);
```

**Impact:** OTP codes are printed to stdout/stderr when SMTP is not configured. In cloud environments (Vercel, Railway, etc.), console output may be captured by logging services, exposing the OTP.

**Risk:** High if SMTP is not configured and logs are externally accessible. Low if SMTP is configured (OTP is sent via email, not logged).

**Recommendation:** Still log for debugging during development, but ensure production environments have SMTP configured. Add a runtime check that blocks unconfigured SMTP in production.

### H3. PIN Reset to `123456`
**File:** `apps/mobile/app/(auth)/lock.tsx`  
**Severity:** High  
**CWE:** CWE-1394 (Use of Default Credentials)

```typescript
const pinCode = '123456';
```

**Impact:** After 5 failed PIN attempts and successful master password entry, the PIN is reset to `123456` without user's explicit choice.

**Risk:** High - a user may not realize their PIN has been reset to a predictable value.

**Recommendation:** Prompt the user to enter a new 6-digit PIN instead of silently resetting.

---

## MEDIUM FINDINGS

### M1. In-Memory Rate Limiting
**File:** `apps/admin/lib/rateLimit.ts`  
**Severity:** Medium  
**CWE:** CWE-799 (Improper Control of Interaction Frequency)

- State stored in a Map that resets on server restart
- No persistence across deployments
- Not suitable for serverless environments

### M2. Magic Password Regex
**File:** `apps/mobile/app/(auth)/onboarding.tsx`  
**Severity:** Medium

```typescript
const passwordRegex = /^KK-[A-HJ-NP-Za-hj-km-np-z2-9@#$%]{12}$/;
```

**Impact:** Poor regex design (note the regex `A-HJ-NP-Z` skips I, O) combined with validation that may reject perfectly valid passwords. Also useful but worth noting.

### M3. Sensitive Data in localStorage (Web)
**File:** `apps/mobile/src/utils/secureStore.ts`  
**Severity:** Medium  
**CWE:** CWE-922 (Insecure Storage of Sensitive Information)

On web platform, `secureStore.ts` falls back to `localStorage` for all stored values including `kk_master_password`, `kk_encrypted_master_key_pin`, etc.

**Impact:** Any XSS vulnerability would expose all stored data. localStorage is not encrypted.

### M4. Missing Input Validation on Several Endpoints
**Files:** All Express/Next.js API routes  
**Severity:** Medium

- `/api/mobile/otp/request` - Validates email exists but missing body format validation
- `/api/mobile/login` - No email sanitization beyond `.toLowerCase().trim()`

### M5. No CSRF Protection
**File:** Admin Next.js app  
**Severity:** Medium  
**CWE:** CWE-352 (Cross-Site Request Forgery)

NextAuth provides CSRF protection for sign-in, but no explicit CSRF tokens for admin server actions (approveUser, rejectUser, etc.).

---

## LOW FINDINGS

### L1. No HTTPS Enforcement
**Location:** Admin Next.js app  
**Recommendation:** Add HTTPS redirect in `next.config.mjs`

### L2. Missing Rate Limiting on Sync
**Location:** `apps/mobile/src/sync/engine.ts`  
Sync operations connect directly to the user's Neon database. No rate limiting on sync attempts.

### L3. SQL Table Name Injection (Theoretical)
**Location:** `apps/mobile/src/db/crud.ts`  
While table names come from an internal whitelist, the pattern of `${table}` in SQL queries is dangerous.

### L4. No Session Timeout
**Location:** Admin NextAuth configuration  
The JWT token expires in 7 days with no configurable session timeout or idle timeout.

---

## Encryption Review

### Password-Based Key Derivation (PBKDF2)

```typescript
// apps/mobile/src/crypto/index.ts
await pbkdf2Async(sha256, password, salt, {
  c: 100_000,      // 100,000 iterations
  dkLen: 32        // 32 bytes = 256 bits
});
```

**Assessment:** 100,000 iterations of PBKDF2-SHA256 is adequate but could be higher (recommended minimum 600k for PBKDF2 in 2024). Consider using Argon2id when Hermes engine supports it.

### AES-256-GCM Encryption

```typescript
const aesGcm = gcm(key, iv);
const encrypted = aesGcm.encrypt(encoder.encode(plaintext));
```

**Assessment:** AES-256-GCM with random 12-byte IVs is correct and well-implemented. Random IV per encryption ensures semantic security.

### Key Storage
- **In memory:** CryptoKey stored only in Zustand authStore (never persisted) ✅
- **PIN-protected:** Master key encrypted with PIN-derived key, stored in SecureStore ✅
- **Biometric:** Stored with `requireAuthentication: true` in SecureStore ✅
- **Web fallback:** Uses localStorage (insecure but expected for web platform)

### Server-Side Encryption
```typescript
// apps/admin/lib/crypto.ts
const algorithm = 'aes-256-gcm';
const key = createHash('sha256').update(secret).digest();
```

**Assessment:** Used only for encrypting master password before storage on server (for recovery). The DB URL is NEVER decrypted server-side. ✅

---

## Authentication Flow Review

### Mobile App Authentication
1. **Master Password Entry** → PBKDF2 key derivation
2. **PIN Setup** → PIN-derived key encrypts master key
3. **Biometric** → Master key stored in biometric-gated SecureStore
4. **Daily Unlock** → PIN decrypts master key (or biometric)

**Assessment:** Well-designed defense-in-depth. The master password never leaves the device.

### Admin Authentication
1. **NextAuth Credentials Provider** → Email/password against ENV vars
2. **JWT Session** → Role embedded in token

**Assessment:** Single admin user is limiting. NextAuth v5 beta is stable but still pre-release.

---

## Authorization Review

### Admin Authorization
- Single admin role (hardcoded)
- No permission granularity
- All admin pages accessible with any valid session

### Mobile Authorization
- All data is local and encrypted
- No server-side authorization needed
- User-specific data isolation via encryption

**Assessment:** Authorization is minimal by design (zero-knowledge architecture). The admin panel should add role-based access if multiple admins are added.

---

## Recommendations by Priority

### Immediate
1. Remove hardcoded JWT fallback secret
2. Add production check for SMTP configuration
3. Fix PIN reset flow to prompt for new PIN

### Short Term
1. Add rate limiting to sync operations
2. Add input validation library (Zod)
3. Add HTTPS enforcement in Next.js config

### Medium Term
1. Implement database-backed rate limiting
2. Add CSRF protection for server actions
3. Consider Argon2id for password hashing
4. Add session timeout and refresh for admin panel

---

## Conclusion

KutumbKosh has a strong security foundation with its zero-knowledge, E2E encrypted architecture. The encryption implementation is correct and follows best practices. The main security concerns are configuration-level (hardcoded fallbacks, console logging) rather than architectural. With the recommended fixes applied, the application would meet enterprise security standards for a financial management tool.

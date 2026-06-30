# Architecture Review: KutumbKosh

> [!NOTE]
> **Update (June 30, 2026):** The dynamic SQL building, Fragile Web DB simulator, and dependency coupling findings identified in this review have been resolved (using AlaSQL, whitelisting, and validation routines). See [MASTER_IMPLEMENTATION_STATUS.md](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/MASTER_IMPLEMENTATION_STATUS.md) for verification details.

> Generated: June 26, 2026  
> Scope: Full monorepo audit

---

## Executive Summary

**Architecture Rating: 7.5/10**

KutumbKosh uses a well-designed zero-knowledge, offline-first architecture. The separation between mobile (React Native/Expo) and admin (Next.js) with shared types package is clean. However, several architectural concerns around scalability, maintainability, and developer experience need attention.

---

## 1. Overall Architecture

```
┌─────────────────────────────────────────────────────┐
│                   KutumbKosh Monorepo                 │
│                        (npm workspaces)               │
│  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │  Mobile App (Expo)   │  │  Admin (Next.js 14)      │ │
│  │  - React Native 0.85 │  │  - App Router            │ │
│  │  - Expo Router       │  │  - Drizzle ORM           │ │
│  │  - Zustand Stores    │  │  - NextAuth v5           │ │
│  │  - Local SQLite      │  │  - PostgreSQL (Neon)     │ │
│  │  - AES-256-GCM       │  └─────────────────────────┘ │
│  └─────────────────────┘                               │
│                        ┌─────────────────────────────┐ │
│                        │  Shared Package              │ │
│                        │  @kutumbkosh/shared          │ │
│                        │  - TypeScript types          │ │
│                        │  - Constants (subcategories) │ │
│                        └─────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Build System:** Turborepo (npm workspaces)  
**Package Manager:** npm 10.8.2

---

## 2. Mobile App Architecture

### Strengths
- **Offline-first**: Local SQLite database with encryption at rest
- **Zero-knowledge**: Master password never leaves the device unencrypted
- **End-to-end encryption**: AES-256-GCM with PBKDF2 key derivation
- **Biometric integration**: Face ID / Fingerprint support
- **Background sync**: expo-background-fetch for scheduled sync
- **Push notifications**: expo-notifications for reminders
- **Zustand stores**: Well-structured with persistence middleware

### Issues

#### 2a. Web Database Mock (HIGH RISK)
The `apps/mobile/src/db/index.ts` contains a full `webDbMock` object that simulates SQLite for web platform. This is a significant maintenance burden:

- **SQL parsing**: Custom SQL parser with regex-based matching - extremely fragile
- **Missing SQL features**: JOINs, GROUP BY, aggregate functions other than COUNT not supported
- **Data inconsistency**: The mock behaves differently from real SQLite
- **Performance**: All data stored in localStorage with full table reads

**Recommendation:** Use `expo-sqlite` with `@expo/websql` or SQL.js for web compatibility instead.

#### 2b. Dynamic SQL String Interpolation (MEDIUM RISK)
SQL queries throughout `crud.ts` and `engine.ts` use dynamic table names via `${table}`:

```typescript
`INSERT INTO ${table} (local_id, iv, data, sync_status, created_at, updated_at ${indexColPlaceholder})
 VALUES (?, ?, ?, 'pending', ?, ? ${indexValPlaceholder})`
```

While `table` is controlled internally, this pattern prevents static analysis and could lead to issues if table names change.

#### 2c. Import Side Effects in CRUD (MEDIUM)
`crud.ts` dynamically imports sync engine on every CRUD operation:

```typescript
import('../sync/engine').then(({ performSync }) => {
```

This creates tight coupling between data operations and sync logic. Better to use an event-driven approach.

#### 2d. Zustand Store Pattern
Stores are well-structured, but `useAuthStore` stores the raw `CryptoKey` (Uint8Array) in memory, which is correct but not serializable - the `persist` middleware on `syncStore` and `uiStore` is correctly skipped for authStore.

### Folder Structure Assessment
```
apps/mobile/
├── app/                 # Expo Router screens (file-based routing)
│   ├── (auth)/          # Auth flow (onboarding, lock, recover)
│   ├── (main)/          # Main app (dashboard, money, records, settings)
│   └── _layout.tsx      # Root layout with app initialization
├── src/
│   ├── components/      # Reusable components (3 files)
│   ├── crypto/          # Encryption/decryption utilities
│   ├── db/              # SQLite database and CRUD operations
│   ├── store/           # Zustand state management
│   ├── sync/            # Sync engine and scheduler
│   └── utils/           # Utilities (admin API, alerts, calculations, etc.)
```

**Good:** Feature-grouped folder structure  
**Needs improvement:** Components folder underutilized (only 3 components), no hooks directory

---

## 3. Admin App Architecture

### Strengths
- **Next.js 14 App Router**: Modern routing with RSC support
- **Drizzle ORM**: Type-safe database queries
- **NextAuth v5**: Well-configured with JWT sessions
- **Rate limiting**: In-memory rate limiting on sensitive endpoints
- **Audit logging**: Comprehensive action logging
- **SMTP email**: Welcome emails and OTP recovery

### Issues

#### 3a. In-Memory Rate Limiting (MEDIUM)
The `rateLimit.ts` uses `Map<string, { count, resetAt }>` - this data is lost on server restart and doesn't scale across multiple instances.

#### 3b. Single Admin User (HIGH)
Auth is hardcoded to single `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars. No multi-admin support, no role-based access beyond a hardcoded "admin" role.

#### 3c. Server Component / Client Component Boundary
- `dashboard/page.tsx` and `users/page.tsx` are server components that fetch data
- `UsersTable.tsx` is a client component with server actions
- This pattern is correct but `dashboard/page.tsx` has `export const revalidate = 0` which disables caching entirely

#### 3d. Missing Error Boundaries
No React error boundaries in either app. A runtime error in a client component will crash the entire page.

---

## 4. Shared Package

```json
{
  "name": "@kutumbkosh/shared",
  "main": "./src/types.ts",
  "types": "./src/types.ts"
}
```

- Contains all TypeScript interfaces and constants
- No validation logic, no utility functions - just types
- Missing Zod schemas for runtime validation
- No shared API client or API types

---

## 5. Data Flow Architecture

### Local (Mobile)
```
User Input → Validate → Encrypt (AES-256-GCM) → INSERT SQLite → Background Sync
```

### Sync Flow (Mobile → Cloud)
```
SQLite SELECT pending → Connect Neon → INSERT/UPDATE kk_* tables → Mark synced
```

### Remote Pull (Cloud → Mobile)
```
Neon SELECT WHERE updated_at > last_synced → Decrypt → INSERT/REPLACE SQLite
```

**Observations:**
- Sync is unidirectional-first (mobile pushes), with pull as second step  
- Delta sync uses `updated_at` watermark - correct approach
- Conflict detection exists but resolution is limited (remote wins or stores conflict)
- No sync for `sync_conflicts` or `sync_log` tables (they're local-only)

---

## 6. Dependency Analysis

### Mobile App
- **Expo SDK 56** (latest)
- **React 19.2.3** + React Native 0.85.3
- **React Query** available but NOT USED anywhere
- **Zustand** for state management (used)
- **@noble/ciphers** + **@noble/hashes** for crypto (good choices)
- **victory-native** + **react-native-svg** for charts (heavy, used only on dashboard)
- **jspdf** + **xlsx** for export (significant bundle size)
- **i18next** + **react-i18next** for i18n (configured but translation keys not populated)

### Admin App
- **Next.js 14** with App Router
- **React 18.3.1** (MISMATCH with mobile's React 19)
- **Drizzle ORM** with pg driver
- **NextAuth v5** beta
- **bcryptjs** for password hashing
- **nodemailer** for email

---

## 7. Key Architectural Recommendations

### Immediate (High Priority)
1. ✅ **Extract SQLite abstraction** from webDbMock to use real SQL.js on web
2. ✅ **Add proper error boundaries** to both apps
3. ✅ **Fix React version mismatch** (admin on 18, mobile on 19)

### Short Term
1. **Create shared validation package** (Zod schemas for all entity types)
2. **Introduce React Query** for data fetching (remove manual state management)
3. **Create shared hooks package** (useMembers, useRecords, etc.)
4. **Add proper logging service** to replace console.log/error

### Medium Term
1. **Implement multi-admin support** with proper RBAC
2. **Move rate limiting to Redis or database-backed**
3. **Create shared UI component library** (design system)
4. **Add end-to-end testing** (Detox or Maestro)

### Long Term
1. **Microservices-ready**: Extract sync server into separate service
2. **Event-driven architecture**: Use message queue for sync operations
3. **Real-time collaboration**: WebSocket-based multi-device sync

---

## 8. Architecture Scorecard

| Category | Score | Notes |
|---|---|---|
| Separation of Concerns | 8/10 | Clean monorepo structure |
| Data Flow | 7/10 | SQL injection risk via string interpolation |
| State Management | 8/10 | Zustand well used, React Query underutilized |
| Security Architecture | 9/10 | Zero-knowledge, E2E encryption excellent |
| Scalability | 5/10 | In-memory rate limiting, single admin |
| Testing | 2/10 | No automated tests found |
| Error Handling | 4/10 | No error boundaries, minimal error recovery |
| Developer Experience | 6/10 | Missing seed scripts, no Storybook |
| Bundle Size | 5/10 | Heavy charting and export libraries |

---

## 9. Conclusion

KutumbKosh has a solid architecture foundation with its zero-knowledge, offline-first design. The monorepo structure is clean and the separation between apps is well-defined. However, several architectural debts need addressing: the web SQLite mock, missing error boundaries, lack of tests, and scalability limitations in the admin backend.

**Next recommended actions:**
1. Fix the React version mismatch
2. Add runtime validation with Zod
3. Extract webDbMock to use SQL.js
4. Add error boundaries
5. Set up automated testing infrastructure

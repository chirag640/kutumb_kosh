# KutumbKosh — Product Requirements Document v2.0

**Product Name:** KutumbKosh (Family Treasury)
**Version:** 2.0 — Complete Architecture Redesign
**Platforms:** React Native (iOS + Android) + Next.js Admin Panel
**Database:** User-owned Neon / Supabase PostgreSQL
**Auth Model:** Email → Admin approval → Credentials delivered by email
**Date:** June 2026

---

## 1. SYSTEM OVERVIEW

KutumbKosh is a **three-part system**:

```
┌─────────────────────────────────────────────────────┐
│                   USER'S PHONE                      │
│          React Native App (iOS + Android)           │
│  - Local SQLite (offline-first)                     │
│  - Sync to user's own Neon/Supabase DB              │
│  - AES-256 encrypted at rest + in transit           │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS sync (manual + EOD)
                     ▼
┌─────────────────────────────────────────────────────┐
│              USER'S OWN DATABASE                    │
│      Neon / Supabase (free tier, user-owned)        │
│  - User provides their DB URL at onboarding         │
│  - Admin never sees or stores this URL              │
│  - Encrypted blobs stored, not raw data             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 ADMIN PANEL                         │
│         Next.js Web App (your dashboard)            │
│  - User registration approvals                      │
│  - Email dispatch (master password + DB URL guide)  │
│  - Usage stats (no financial data — only metadata)  │
│  - Stores ONLY: email, name, status, joined date    │
└─────────────────────────────────────────────────────┘
```

**Core principle:** You (the admin) never touch any user's financial data. You only manage who gets access. Each user's data lives in their own database, encrypted with their own master password.

---

## 2. COMPLETE TECH STACK

### 2.1 Mobile App (React Native)

| Layer | Technology | Why |
|---|---|---|
| Framework | React Native 0.74 + TypeScript | Cross-platform iOS + Android |
| Navigation | Expo Router v3 (file-based) | Simpler than React Navigation |
| Managed Workflow | Expo SDK 51 | OTA updates, no Xcode/Android Studio pain |
| Local DB | expo-sqlite (SQLite) | Offline-first, fast, built-in |
| Encryption | expo-crypto + custom AES-256-GCM | Native crypto, not JS |
| State | Zustand + React Query (TanStack) | Local state + server sync |
| UI Components | React Native Paper + custom | Material Design, well-tested |
| Charts | Victory Native XL | GPU-accelerated, React Native native |
| Sync | Custom sync engine (described below) | Full control |
| Remote DB client | postgres (pg) via REST / Supabase JS SDK | Connect to user's DB |
| Biometric | expo-local-authentication | Face ID + fingerprint |
| Notifications | expo-notifications | Push + local scheduled |
| Background tasks | expo-background-fetch | EOD sync scheduler |
| Secure storage | expo-secure-store | Store encrypted key material |
| Export | react-native-share + XLSX.js + jsPDF | Excel + PDF |
| i18n | i18next + react-i18next | English, Gujarati, Hindi |
| OTA Updates | expo-updates | Push fixes without App Store review |

### 2.2 Admin Panel (Next.js)

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| UI | shadcn/ui + Tailwind CSS |
| Auth | NextAuth.js (admin login only — single account) |
| Admin DB | Neon PostgreSQL (your own — stores only user metadata) |
| ORM | Drizzle ORM |
| Email | Resend (transactional email API) |
| Hosting | Vercel |

### 2.3 Infrastructure

| Service | Purpose | Cost |
|---|---|---|
| Vercel | Host Next.js admin panel | Free tier |
| Neon (admin's own) | Admin metadata DB | Free tier |
| Resend | Send emails to users | Free (3000/month) |
| Neon / Supabase | User's own DB (user pays — free tier is sufficient) | User pays ₹0 |

**Total infrastructure cost to you: ₹0/month** for up to ~100 users.

---

## 3. AUTHENTICATION FLOW

This is the most unique part of KutumbKosh. No traditional login — by design.

### 3.1 Registration Flow

```
User fills registration form
        │
        ▼
  [ Name, Email, Family Name, Member Count ]
        │
        ▼
  Submitted → stored in admin DB as status: "pending"
        │
        ▼
  Admin receives email notification:
  "New registration request from Rahul Patel (rahul@email.com)"
        │
        ▼
  Admin reviews in Admin Panel → clicks "Approve"
        │
        ▼
  System auto-generates:
  ┌─────────────────────────────────────────────┐
  │  Master Password: KK-xJ9#mP2@vL4            │
  │  (12-char, symbols+numbers+letters)          │
  │                                             │
  │  Welcome Email Content:                     │
  │  - App download links (iOS + Android)       │
  │  - Their generated Master Password          │
  │  - Instructions to set up their own         │
  │    Neon/Supabase free database              │
  │  - Step-by-step: "Create free account at    │
  │    neon.tech → copy your connection URL"    │
  │  - Security warning: save this password,    │
  │    it cannot be recovered                   │
  └─────────────────────────────────────────────┘
        │
        ▼
  Resend API sends email to user
        │
        ▼
  User opens app → enters email + master password
        │
        ▼
  App asks: "Paste your Neon/Supabase DB URL"
  (one-time setup, stored in expo-secure-store encrypted)
        │
        ▼
  App connects to their DB → creates schema → ready
```

### 3.2 What Admin Stores (admin DB schema)

```sql
-- admin_users table (the ONLY table in admin's DB)
CREATE TABLE admin_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  family_name TEXT,
  member_count INT DEFAULT 5,
  status      TEXT DEFAULT 'pending', -- pending | approved | suspended
  approved_at TIMESTAMPTZ,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  last_seen   TIMESTAMPTZ,
  app_version TEXT,
  -- NO database URL stored here (user keeps it)
  -- NO financial data ever
  -- NO master password stored (generated once, emailed, not saved)
);
```

**That's it.** Admin DB has exactly one table.

### 3.3 App-Side Auth

```
On app open:
1. Check expo-secure-store for { email, encryptedDBUrl, saltHex }
2. If not found → show onboarding
3. If found → show PIN / biometric screen
4. On PIN/biometric success → derive AES key from master password
   (master password stored NOWHERE — user must re-enter if they reinstall)
5. Key lives in memory (Zustand) until app goes to background
```

---

## 4. DATABASE ARCHITECTURE

### 4.1 User's Own DB Schema

When user connects their Neon/Supabase URL, the app runs this migration automatically:

```sql
-- All tables use TEXT for data (stores AES-256-GCM encrypted JSON blobs)
-- Index columns stored unencrypted for querying

CREATE TABLE kk_family_members (
  id          SERIAL PRIMARY KEY,
  iv          TEXT NOT NULL,
  data        TEXT NOT NULL,  -- encrypted JSON
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ  -- soft delete for sync
);

CREATE TABLE kk_income_entries (
  id          SERIAL PRIMARY KEY,
  iv          TEXT NOT NULL,
  data        TEXT NOT NULL,
  entry_date  DATE NOT NULL,  -- unencrypted, for date queries
  member_idx  INT,            -- unencrypted member ID index
  synced_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE kk_expense_entries (
  id           SERIAL PRIMARY KEY,
  iv           TEXT NOT NULL,
  data         TEXT NOT NULL,
  entry_date   DATE NOT NULL,
  category_idx TEXT,          -- unencrypted category for budget queries
  synced_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- Same pattern for: kk_bank_accounts, kk_lic_policies,
-- kk_insurance_policies, kk_loans, kk_documents,
-- kk_fdrd, kk_property, kk_goals, kk_reminders

CREATE TABLE kk_sync_log (
  id          SERIAL PRIMARY KEY,
  synced_at   TIMESTAMPTZ DEFAULT now(),
  device_id   TEXT,
  records_pushed INT,
  records_pulled INT,
  sync_type   TEXT  -- 'manual' | 'scheduled' | 'on_open'
);
```

### 4.2 Local SQLite Schema (expo-sqlite)

Mirrors the Postgres schema exactly, plus two extra columns:

```sql
-- Extra columns on every local table:
sync_status  TEXT DEFAULT 'pending'  -- 'pending' | 'synced' | 'conflict'
local_id     TEXT UNIQUE             -- UUID, used before server assigns id
```

### 4.3 Sync Engine

**Philosophy:** SQLite is the source of truth for daily use. Postgres is the backup/restore source. Sync is always **local → remote** (push), never remote → local except on fresh install / restore.

```
SYNC FLOW:

1. Collect all local rows where sync_status = 'pending'
2. Batch encrypt each row (already encrypted in SQLite, re-use same ciphertext)
3. POST batch to user's Postgres via pg connection:
   INSERT INTO kk_xxx (iv, data, entry_date, ...) 
   ON CONFLICT (local_id) DO UPDATE SET data = excluded.data, updated_at = now()
4. On success: mark local rows as sync_status = 'synced'
5. Log to kk_sync_log
6. Update "Last synced: Today 11:59 PM" in Settings

CONFLICT RESOLUTION:
- Updated_at timestamp wins (last write wins)
- On reinstall: pull all from Postgres → decrypt → populate local SQLite

SYNC TRIGGERS:
a) Manual: user taps "Sync Now" button (Settings screen)
b) EOD Scheduler: expo-background-fetch fires at midnight device time
c) On fresh install / DB restore
```

---

## 5. SCREENS & NAVIGATION (React Native)

### Navigation Structure

```
Root Navigator
├── Auth Stack (no bottom tab)
│   ├── Splash
│   ├── Onboarding (multi-step)
│   ├── Lock Screen (PIN / biometric)
│   └── Master Password Entry
│
└── Main Tab Navigator (after unlock)
    ├── Tab 1: Dashboard
    ├── Tab 2: Money (Income + Expenses)
    ├── Tab 3: Records (LIC, Insurance, Loans, Docs, FD, Property, Banks)
    ├── Tab 4: Reminders
    └── Tab 5: Settings
```

### Tab Bar Design (minimal)
- 5 tabs, icon only (no labels — cleaner)
- Active tab: filled icon, primary color
- Inactive: outline icon, gray
- FAB (+) floats above center of tab bar for quick add

---

## 6. ALL SCREENS

### Screen 1: Dashboard
Clean, card-based. Three sections:

**Top Row — 3 metric cards:**
- Monthly Income (green)
- Monthly Expenses (red)
- Net Savings + Savings % (blue)

**Middle Row — 2 metric cards:**
- Outstanding Loans total
- Net Worth (bank + FD/RD - loans)

**Alert Strip** (horizontal scroll, pill badges):
- 🔴 Overdue items
- 🟠 Due this week
- 🟡 Due this month
- 🔵 Birthdays

**Charts** (swipeable card):
- Slide 1: 6-month income vs expense bar chart
- Slide 2: Expense breakdown donut
- Slide 3: Savings trend line

---

### Screen 2: Income Tracker
List view grouped by month. Each entry shows: member avatar, source tag, amount, date.

Add Income sheet (bottom sheet):
- Date picker
- Member selector (avatar row)
- Source dropdown
- Amount (numpad)
- Notes (optional)
- Recurring toggle

---

### Screen 3: Expense Tracker
Same pattern as Income. Category shown as colored chip.

Budget status bar at top: "₹12,400 / ₹20,000 spent this month"

Quick-add: FAB opens bottom sheet directly.

---

### Screen 4: Cash Flow Summary
Month-by-month table. Tap any month → detailed breakdown.
Year selector at top. Export button (top right).

---

### Screen 5: Bank Accounts
Card per account. Shows last 4 digits, balance, owner initial.
Tap → edit balance (manual update, not bank integration).

---

### Screen 6: LIC Policies
List with colored urgency strip on left side of each card.
Premium calendar view (optional toggle): shows dues on a monthly calendar.

---

### Screen 7: Insurance Policies
Same as LIC. Color-coded rows by days to renewal.

---

### Screen 8: Loans & EMI
Each loan card shows:
- Progress bar (% repaid)
- Remaining EMIs
- Payoff date countdown

Totals card at top: Total EMI burden this month.

---

### Screen 9: Important Documents
Grid view (2 columns) — each document as a card with:
- Document type icon
- Holder name
- Status chip (Valid / Expiring / Expired)

Tap → full detail. Long press → reveal masked number (requires biometric).

---

### Screen 10: Reminders & Renewals
Timeline view — grouped as: Overdue → This Week → This Month → Later.
Mark as done → swipe right.
Snooze → swipe left → pick 7/14/30 days.

---

### Screen 11: FD & RD Tracker
Cards with maturity progress bar.
Maturity amount shown prominently.
Days to maturity countdown.

---

### Screen 12: Property Register
Simple list. Each property shows type icon, location, estimated value.

---

### Screen 13: Savings Goals
Goal cards with animated progress circles.
Projected completion date shown.

---

### Screen 14: Per-Member Analytics
Reached from Family Members screen → tap member → Analytics.
Shows their income contribution, expenses paid, policies, documents.

---

### Screen 15: Annual Summary
Year picker. Table + bar chart comparison.
Export to PDF button.

---

### Screen 16: Family Members
Profile cards. Tap → full profile with linked records.
Birthday countdown badge.

---

### Screen 17: Settings

**Sections (minimal list):**
- 🔐 Security (PIN, biometric, auto-lock, privacy screen)
- 🔄 Sync (Last synced, Sync Now, EOD schedule toggle, sync log)
- 💾 Backup & Restore (your DB URL, test connection, restore from DB)
- 📤 Export (Excel, PDF)
- 💰 Budget Limits (per category)
- 🔔 Notifications (lead times per type)
- 🌐 Language (English / ગુજરાતી / हिंदी)
- 🎨 Theme (Light / Dark / System)
- ℹ️ About (version, last sync, storage used)

---

## 7. ADMIN PANEL (Next.js)

### URL: yourdomain.com/admin

### Admin Login
- Single admin account (hardcoded in env vars — no registration)
- Email + password, session cookie
- Protected by NextAuth.js

### Admin Dashboard (homepage)
Minimal stats — no financial data:
- Total registered users
- Pending approvals (badge count)
- Approved this month
- Last 10 activity entries

### User Management Page (main page)

**Table columns:**
Name | Email | Family Name | Members | Registered | Status | Last Active | Actions

**Actions:**
- Pending users: [Approve] [Reject]
- Approved users: [Suspend] [Resend Welcome Email]
- All: [View Details]

**Approve action flow:**
1. Admin clicks Approve
2. System generates 12-char master password
3. Sends welcome email via Resend:
   - Subject: "Welcome to KutumbKosh — Your Access Details"
   - Body: name, master password, app download links, DB setup guide
4. Status → approved, approved_at = now()
5. Master password is NOT stored anywhere after email is sent

### Email Templates Page
Admin can edit the welcome email template (rich text editor).
Variables: {{name}}, {{masterPassword}}, {{appStoreLink}}, {{playStoreLink}}

### Settings Page
- Admin email (for approval notifications)
- Resend API key configuration
- App version (shown in emails)
- Maintenance mode toggle (blocks new registrations)

---

## 8. SYNC DESIGN (detailed)

### 8.1 Sync States Per Record

```
LOCAL ONLY (never synced)    → sync_status: 'pending'
SYNCED                       → sync_status: 'synced'
MODIFIED AFTER SYNC          → sync_status: 'pending' (reset on any edit)
DELETED                      → deleted_at set, sync_status: 'pending'
```

### 8.2 Sync Payload Structure

```typescript
interface SyncBatch {
  deviceId: string;          // unique per install
  syncedAt: string;          // ISO timestamp
  tables: {
    [tableName: string]: {
      upsert: EncryptedRecord[];   // new + modified
      delete: string[];            // local_ids to soft-delete
    }
  }
}
```

### 8.3 EOD Scheduler

```typescript
// expo-background-fetch
TaskManager.defineTask('EOD_SYNC', async () => {
  const now = new Date();
  // Only run between 11:45 PM and 11:59 PM
  if (now.getHours() === 23 && now.getMinutes() >= 45) {
    await performSync('scheduled');
    return BackgroundFetch.BackgroundFetchResult.NewData;
  }
  return BackgroundFetch.BackgroundFetchResult.NoData;
});
```

### 8.4 Sync UI

In Settings → Sync section:
```
Last synced: Today, 11:58 PM ✓
Pending changes: 3 entries

[ Sync Now ]

Auto sync: ON  (EOD at midnight)

[ View Sync Log ]  → shows last 30 sync events
```

Status indicators in header (small dot):
- 🟢 All synced
- 🟡 Pending changes (not yet synced)
- 🔴 Sync failed (tap for error)

---

## 9. ONBOARDING FLOW (React Native)

**Step 1 — Welcome**
App logo, tagline, "Get Started"

**Step 2 — Enter Credentials (from email)**
- Email field
- Master Password field (show/hide)
- "I received these in my welcome email" note

**Step 3 — Connect Your Database**
- Explanation: "Your data is stored in your own private database"
- "Don't have one? Get a free Neon database →" (opens browser to neon.tech)
- Paste DB connection URL field
- [Test Connection] button → shows ✓ or error
- On success: app creates schema automatically

**Step 4 — Set PIN**
- 6-digit PIN (faster daily unlock)
- Confirm PIN
- Enable biometric toggle (if device supports it)

**Step 5 — Add Family Members**
- Quick add form (name + relationship + DOB)
- Add up to 10 members
- At least 1 required

**Step 6 — Set Monthly Budgets (optional)**
- Category budget sliders
- Can skip → configure later in Settings

**Done → Dashboard**

---

## 10. SECURITY MODEL (updated)

| What | How |
|---|---|
| Financial data at rest | AES-256-GCM via expo-crypto |
| Financial data in transit | HTTPS + encrypted blob (double-encrypted) |
| Master password | Never stored — derived key lives in memory only |
| DB URL | Stored in expo-secure-store (hardware-backed on modern phones) |
| Admin data | Only email, name, status — zero financial data |
| DB URL at admin | Never stored — admin never knows user's DB URL |
| Document numbers | Masked display, biometric required to reveal |
| Auto-lock | Configurable: 1 / 5 / 10 min of inactivity |
| Privacy screen | Blur all amounts — one tap |
| PIN brute force | 5 failed attempts → require master password |

---

## 11. ADDITIONAL SUGGESTIONS (implement in v2)

These make KutumbKosh significantly more reliable and polished:

### 11.1 Conflict-Free Sync (CRDT approach)
Each record has a `lamport_clock` integer that increments on every edit. During sync, higher lamport clock wins. This eliminates sync conflicts when editing on two devices.

### 11.2 DB Connection Health Check
On every app open, silently test DB connection in background. Show status in Settings. If DB URL has expired (Supabase free tier rotates URLs), show a gentle prompt to update it.

### 11.3 Offline Indicator
Small banner: "Offline — changes saved locally" when no internet. Disappears when online.

### 11.4 Data Integrity Check
Weekly background task: count local records vs remote records. If mismatch >5%, prompt user to re-sync. Detects silent failures.

### 11.5 Emergency Export (no network needed)
"Export All to Phone" button: generates encrypted ZIP of all data to device Downloads. User can email it to themselves as a manual backup.

### 11.6 Admin Audit Log
Admin panel logs: who was approved, when, by which admin action. Non-repudiable. Stored in admin DB only.

### 11.7 App Version Gate
Admin can set minimum required app version. Old app versions get a soft prompt to update (via expo-updates OTA, or App Store for major versions).

### 11.8 Neon vs Supabase Auto-Detect
App detects from URL format whether user is using Neon or Supabase and uses the appropriate client SDK (both are standard Postgres but connection handling differs slightly).

### 11.9 Sync Retry Queue
If sync fails (no internet, DB timeout), entries go into a retry queue. Next time internet is available, auto-retry with exponential backoff (1 min, 5 min, 30 min).

### 11.10 Minimal Mode
A "Simple Mode" toggle that hides advanced modules (Property, FD/RD, Goals, Annual Summary) for family members who find it overwhelming. Power users see everything.

---

## 12. PERFORMANCE TARGETS

| Metric | Target |
|---|---|
| App cold start | < 2 seconds |
| Local query (any screen) | < 100ms |
| Sync 100 records | < 5 seconds on 4G |
| Charts render | < 300ms |
| Export (Excel, 1 year data) | < 8 seconds |
| APK size (Android) | < 40MB |
| IPA size (iOS) | < 45MB |
| Offline capability | 100% (all screens work offline) |
| Background sync success rate | > 95% |

---

## 13. FILE STRUCTURE

```
kutumbkosh/
├── apps/
│   ├── mobile/                    ← React Native (Expo)
│   │   ├── app/                   ← Expo Router screens
│   │   │   ├── (auth)/
│   │   │   │   ├── onboarding.tsx
│   │   │   │   └── lock.tsx
│   │   │   └── (main)/
│   │   │       ├── dashboard.tsx
│   │   │       ├── income.tsx
│   │   │       ├── expenses.tsx
│   │   │       └── ...
│   │   ├── src/
│   │   │   ├── crypto/            ← AES-256 functions
│   │   │   ├── db/                ← SQLite schema + queries
│   │   │   ├── sync/              ← Sync engine + scheduler
│   │   │   ├── store/             ← Zustand stores
│   │   │   ├── components/        ← Shared UI components
│   │   │   ├── i18n/              ← en, gu, hi JSON
│   │   │   └── export/            ← Excel + PDF generators
│   │   └── app.json               ← Expo config
│   │
│   └── admin/                     ← Next.js Admin Panel
│       ├── app/
│       │   ├── (auth)/login/
│       │   └── (admin)/
│       │       ├── dashboard/
│       │       ├── users/
│       │       ├── emails/
│       │       └── settings/
│       ├── lib/
│       │   ├── db/                ← Drizzle ORM + admin schema
│       │   ├── auth/              ← NextAuth config
│       │   └── email/             ← Resend templates
│       └── next.config.ts
│
├── packages/
│   └── shared/                    ← Shared TypeScript types
│       └── types/
│           ├── models.ts          ← FamilyMember, IncomeEntry, etc.
│           └── sync.ts            ← SyncBatch, SyncLog types
│
└── package.json                   ← Turborepo monorepo root
```

---

*End of PRD v2.0 — KutumbKosh*

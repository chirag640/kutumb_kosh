# Database Review: KutumbKosh

> [!NOTE]
> **Update (June 30, 2026):** All recommended indexes (composite date indexes, admin status indexes), RLS policies, transaction wrappings, mobile migrations, and admin pagination systems have been fully implemented. See [MASTER_IMPLEMENTATION_STATUS.md](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/MASTER_IMPLEMENTATION_STATUS.md) for verification details.

> Generated: June 26, 2026  
> Scope: Local SQLite (mobile) + Neon PostgreSQL (cloud)

---

## Database Score: 7.5/10

| Category | Score | Notes |
|---|---|---|
| Schema Design | 8/10 | Clean, normalized |
| Indexes | 6/10 | Missing composite indexes |
| Data Integrity | 7/10 | No foreign keys in SQLite |
| Migration Strategy | 5/10 | No migration system for mobile |
| Query Performance | 7/10 | Can degrade with large datasets |

---

## 1. Local SQLite Database (Mobile)

### Schema Overview

```sql
-- Template pattern for all 11 entity tables
CREATE TABLE {name} (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  local_id    TEXT UNIQUE NOT NULL,
  iv          TEXT NOT NULL,
  data        TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  {extra_index_cols}
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- Additional tables
CREATE TABLE sync_log (...);
CREATE TABLE sync_conflicts (...);
CREATE TABLE app_settings (...);
```

### Entity Tables

| Table | Index Columns | Purpose |
|---|---|---|
| family_members | None | Family member profiles |
| income_entries | entry_date, member_idx | Income records |
| expense_entries | entry_date, category_idx | Expense records |
| bank_accounts | None | Bank accounts |
| lic_policies | due_date | LIC policies |
| insurance_policies | renewal_date | Insurance policies |
| loans | None | Loans |
| documents | expiry_date | Important documents |
| fdrd_entries | maturity_date | FD/RD investments |
| property | None | Property records |
| savings_goals | None | Savings goals |

### Issues Found

#### Issue DB-01: No Foreign Keys in SQLite (Medium)
**Description:** Despite enabling `PRAGMA foreign_keys = ON`, none of the entity tables define foreign key constraints. `holderMemberId`, `paidByMemberId`, `ownerMemberId` etc. reference `family_members.localId` but this is not enforced at the database level.
**Impact:** Deleting a family member may orphan records pointing to them.
**Fix:** SQLite doesn't easily support composite FK references to non-PK columns, but the application should handle cascading deletes.

#### Issue DB-02: Date Stored as TEXT (Low)
**Description:** All date columns (`created_at`, `updated_at`, `entry_date`, etc.) are stored as TEXT rather than SQLite's native date functions.
**Impact:** Date comparisons with `WHERE entry_date = ?` work correctly (ISO format sorts lexicographically). No functional issue, but the TEXT format uses more storage.
**Fix:** Use TEXT with ISO 8601 format (current approach is standard for SQLite ✅)

#### Issue DB-03: Missing `sync_status` Index (Low)
**Description:** The `idx_{name}_sync` index covers `sync_status` for all tables ✅ - this is correctly implemented.

#### Issue DB-04: Missing Composite Date Indexes (Medium)
**Description:** Income and expense tables have indexes on `entry_date` and `member_idx`/`category_idx` separately, but no composite index for `(entry_date, sync_status)` or `(entry_date, deleted_at)`.
**Impact:** Queries that filter by both date range and sync status or deleted_at will be less efficient.
**Fix:** Add composite indexes for common query patterns.

#### Issue DB-05: `app_settings` Not Synchronized (Low)
**Description:** The `app_settings` table (used for monthly budget limit) is not included in the sync process.
**Impact:** Budget limits are per-device and don't sync across devices.
**Fix:** Either sync as a special case or make budget a per-device feature intentionally.

---

## 2. Remote PostgreSQL Database (Cloud)

### Schema (Drizzle ORM)

#### `admin_users` Table
```sql
CREATE TABLE admin_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  family_name         TEXT,
  member_count        INTEGER DEFAULT 5,
  status              user_status DEFAULT 'pending',  -- pending | approved | suspended | rejected
  approved_at         TIMESTAMPTZ,
  joined_at           TIMESTAMPTZ DEFAULT NOW(),
  last_seen           TIMESTAMPTZ,
  app_version         TEXT,
  master_password_hash TEXT,
  encrypted_db_url    TEXT,
  otp_code            TEXT,
  otp_expires_at      TIMESTAMPTZ
);
```

#### `audit_log` Table
```sql
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  target_id   UUID,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### Sync Tables (Created Dynamically by Mobile App)
All `kk_*` tables are created by the mobile app during `setupRemoteDatabase()`.

### Issues Found

#### Issue DB-06: Missing Indexes on Admin Tables (Medium)
**Description:** The `admin_users` table lacks indexes on `status` and `joined_at` columns, which are used for filtering and sorting in the admin dashboard.
**Impact:** Slow queries as user count grows.
**Fix:**
```sql
CREATE INDEX idx_admin_users_status ON admin_users(status);
CREATE INDEX idx_admin_users_joined_at ON admin_users(joined_at);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
```

#### Issue DB-07: No Row-Level Security (Medium)
**Description:** The `admin_users` table has no RLS policies. Any user with database access can query all records.
**Impact:** Low (only admin app has DB access), but defense-in-depth is missing.
**Fix:** Enable RLS on `admin_users` and `audit_log` tables.

#### Issue DB-08: No Data Cleanup for Old Sync Logs (Low)
**Description:** The `kk_sync_log` table grows indefinitely. No retention policy.
**Impact:** Storage growth over time. Minimal cost, but no cleanup mechanism.
**Fix:** Add a periodic cleanup job for sync logs older than 90 days.

#### Issue DB-09: `setupRemoteDatabase()` Creates Tables Without IF NOT EXISTS for Some (Low)
**Description:** The `ALTER TABLE kk_sync_log ADD COLUMN IF NOT EXISTS records_pulled INT;` line is needed because the initial CREATE TABLE might not have included it.
**Impact:** Migration inconsistency between devices.
**Fix:** Define the complete schema in one place and use a versioned migration approach.

#### Issue DB-10: Missing `records_pulled` Column in Initial Schema (Low)
**Description:** The initial `kk_sync_log` CREATE statement doesn't include `records_pulled`, so an ALTER TABLE is needed.
**Fix:** Include all columns in the initial CREATE TABLE statement.

---

## 3. Sync Architecture

### Flow
```
Mobile SQLite ──(pending records)──> Neon PostgreSQL ──(updated records)──> Mobile SQLite
```

### Delta Sync Watermark
```sql
SELECT synced_at FROM sync_log WHERE error IS NULL ORDER BY id DESC LIMIT 1
```

**Assessment:** ✅ This is the correct approach for delta sync. Using the last successful sync timestamp as the watermark.

### Conflict Resolution
```
if localRow.sync_status === 'pending' AND remoteTime > localTime:
    → Store conflict in sync_conflicts
    → Skip overwriting local DB
    → User must resolve manually
```

**Assessment:** ⚠️ The conflict resolution is basic. "Remote wins" is the default for non-conflicting records, but conflicts are stored for manual resolution. The conflict UI in settings/conflicts.tsx is minimal.

---

## 4. Transaction Handling

### Current State
- SQLite: No explicit transactions in CRUD operations
- PostgreSQL: No transactions in sync operations

### Risks
- **Partial writes:** If app crashes during `INSERT OR REPLACE`, data may be in inconsistent state
- **Sync failures:** If sync fails mid-operation, some records may be pushed but not marked as synced

### Recommendations
1. Wrap multi-row sync operations in SQLite transactions
2. Wrap PostgreSQL sync operations in transactions (using `BEGIN/COMMIT`)
3. Add idempotency checks for sync operations

---

## 5. Migration Strategy

### Current
- Mobile: No migration system. Tables created via `CREATE TABLE IF NOT EXISTS`
- Admin: Drizzle Kit configured (`drizzle.config.ts`) but migrations directory may be empty

### Issues
- Adding columns requires manual SQL execution
- No rollback capability
- Schema changes not tracked in version control

### Recommendations
1. **Mobile:** Implement simple migration system using `app_settings` for schema version
2. **Admin:** Run `drizzle-kit generate:pg` to create initial migration files
3. **Version tracking:** Add schema version check in `initializeDB()`

---

## 6. Database Optimization Roadmap

### Immediate
1. ✅ Add indexes on `admin_users.status` and `admin_users.joined_at`
2. ✅ Add composite indexes for common query patterns in income/expense tables
3. ✅ Add data cleanup for old sync logs

### Short Term
1. ✅ Implement migration system (mobile)
2. ✅ Add explicit transaction wrapping
3. ✅ Add pagination to admin user queries

### Medium Term
1. ✅ Enable RLS on admin tables
2. ✅ Implement automatic conflict resolution (last-write-wins with reconciliation)
3. ✅ Add data archiving for records older than 5 years

---

## Conclusion

The database architecture is clean and well-organized. The encrypted blob storage pattern is correct for the zero-knowledge model. Key improvements needed are:
1. Add missing indexes for query performance
2. Implement a proper migration system
3. Add transaction wrapping for data integrity
4. Add RLS for defense-in-depth

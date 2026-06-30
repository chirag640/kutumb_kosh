# Performance Report: KutumbKosh

> [!NOTE]
> **Update (June 30, 2026):** All recommended performance optimizations (including lazy-loading PDF and Excel libraries, FlatList rendering memoizations, SQLite date-range filtering, composite schema indexing, and admin user server-side pagination) have been resolved. See [MASTER_IMPLEMENTATION_STATUS.md](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/MASTER_IMPLEMENTATION_STATUS.md) for details.

> Generated: June 26, 2026  
> Methodology: Static code analysis & architecture review

---

## Performance Score: 6.0/10

| Category | Score | Assessment |
|---|---|---|
| Bundle Size | 5/10 | Large dependencies, no code splitting |
| Render Performance | 6/10 | No memoization, unnecessary re-renders |
| API Latency | 7/10 | Direct DB queries, no caching |
| Database Performance | 6/10 | Missing indexes, potential N+1 queries |
| Startup Time | 6/10 | Sync on startup blocks rendering |
| Image Optimization | N/A | No images to optimize |
| List Performance | 6/10 | FlatList used but not optimized |

---

## Bundle Size Analysis

### Mobile App

#### Dependencies by Size Impact

| Package | Estimated Size | Usage | Priority to Address |
|---|---|---|---|
| `victory-native` + `react-native-svg` | ~500KB gzipped | Dashboard charts only | 🟠 High |
| `jspdf` | ~200KB gzipped | Export screen only | 🟠 High |
| `xlsx` | ~300KB gzipped | Export screen only | 🟠 High |
| `@noble/ciphers` + `@noble/hashes` | ~50KB gzipped | Core crypto (essential) | ✅ Keep |
| `react-native-paper` | ~150KB gzipped | Used for some UI | 🟡 Medium |
| `i18next` + `react-i18next` | ~40KB gzipped | Configured, unused | 🟡 Medium |
| `@tanstack/react-query` | ~30KB gzipped | Imported, NOT used | 🔴 Critical |
| `react-native-gesture-handler` | ~60KB gzipped | Required by expo-router | ✅ Keep |
| `react-native-reanimated` | ~80KB gzipped | Required by expo-router | ✅ Keep |

**Estimated Total Bundle Size:** ~4-5 MB (APK/IPA)  
**Target:** < 3 MB

#### Bundle Optimization Recommendations

1. **Lazy-load heavy libraries** (Priority: High)
   - Dynamically import `jspdf` and `xlsx` only when user opens export screen
   - Dynamically import `victory-native` only when dashboard renders charts

2. **Remove unused packages** (Priority: High)
   - Remove `@tanstack/react-query` if not used
   - Remove `react-native-worklets` if not used
   - Defer `i18next` initialization until language is changed

3. **Replace victory-native with custom SVG** (Priority: Medium)
   - Custom native SVG chart components would save ~350KB
   - The current charts are simple bar/donut/line - custom SVG is feasible

### Admin App

| Package | Estimated Size | Notes |
|---|---|---|
| `next` (14.x) | ~400KB (server) | Required |
| `react` + `react-dom` | ~130KB | Required |
| `drizzle-orm` + `pg` | ~100KB | Required |
| `next-auth` | ~50KB | Required |
| `lucide-react` | ~100KB | Icons (could tree-shake better) |

**Admin bundle looks reasonable.** Next.js code splitting is automatic.

---

## Render Performance Analysis

### Mobile App

#### Current Issues

**Issue 1: No React.memo on List Items**
**Files:** All FlatList `renderItem` components
**Impact:** All list items re-render when parent state changes
**Fix:**
```typescript
const ExpenseCard = React.memo(({ expense }: { expense: ExpenseEntry }) => (
  <TouchableOpacity ...>
    ...
  </TouchableOpacity>
));
```

**Issue 2: Inline Functions in Render**
**Files:** Multiple screens with `onPress={() => ...}` and `renderItem={({ item }) => ...}`
**Impact:** New function references created every render
**Fix:** Extract handlers and renderItem outside component or use useCallback

**Issue 3: No useMemo for Derived Data**
**Files:**
- `apps/mobile/app/(main)/index.tsx` - Monthly calculations, filtering
- `apps/mobile/app/(main)/money/expenses.tsx` - Grouped expenses
- `apps/mobile/app/(main)/money/income.tsx` - Grouped incomes
**Impact:** Expensive array operations run on every render
**Fix:**
```typescript
const groupedExpenses = useMemo(() => {
  return getGroupedExpenses(expenses);
}, [expenses]);
```

**Issue 4: Data Loading on Every Focus**
**Files:** All screens using `useFocusEffect` with `loadData()`
**Impact:** Full data reload on every screen focus - no caching
**Fix:** Use React Query for automatic caching and background refetching

**Issue 5: AppState Listener Memory Leak**
**File:** `apps/mobile/app/_layout.tsx`
**Issue:** The AppState listener is not cleaned up correctly
```typescript
const subscription = AppState.addEventListener('change', handleAppStateChange);
return () => { subscription.remove(); };
```
**This is actually correct ✅** - the cleanup is proper.

### Admin App

**Issue 1: No Caching on Dashboard**
**File:** `apps/admin/app/(admin)/dashboard/page.tsx`
**Code:** `export const revalidate = 0;`
**Impact:** Every page visit triggers a database query
**Fix:** Set appropriate revalidation interval (e.g., `revalidate = 60` for 1 minute) and use React Server Components caching

**Issue 2: Full User List Loaded Without Pagination**
**File:** `apps/admin/app/(admin)/users/page.tsx`
**Impact:** With 1000+ users, the query loads all records into memory
**Fix:** Add server-side pagination with LIMIT/OFFSET

---

## API & Network Performance

### Mobile App

| Aspect | Assessment | Recommendation |
|---|---|---|
| Sync Frequency | Configurable (15min bg fetch) | ✅ Good |
| Delta Sync | Uses `updated_at` watermark | ✅ Good |
| Connection Pool | Single connection per sync | ⚠️ Add connection retry with backoff |
| Payload Size | Encrypted blobs (base64) | ⚠️ Base64 increases size by ~33% |
| Compression | None | Add application-level compression |

### Admin App

| Endpoint | Frequency | Current | Recommended |
|---|---|---|---|
| GET /dashboard | On each visit | Full DB scan | Cache for 60s |
| GET /users | On each visit | Full table scan | Paginate + cache |
| POST /login | Rare | Rate limited (5/15min) | ✅ Good |
| POST /otp/request | Rare | Rate limited (5/15min) | ✅ Good |

---

## Startup Performance

### Mobile App

**Current Startup Sequence:**
```
App Launch → initializeDB() → registerEODSync() → 
Notification permissions → scheduleAlertsIfNeeded() → 
Check SecureStore → Route decision → Sync (on unlock)
```

**Issues:**
1. `initializeDB()` creates 11 tables + indexes on every launch
2. `scheduleAlertsIfNeeded()` queries all lic_policies, insurance_policies, documents
3. Sync triggers on unlock without checking network connectivity

**Recommendations:**
1. Add SQLite WAL mode (already done ✅)
2. Defer `scheduleAlertsIfNeeded()` to after initial render
3. Check network connectivity before sync
4. Cache route decision to avoid SecureStore read on every launch

---

## Database Performance

### Local SQLite

| Aspect | Current | Recommendation |
|---|---|---|
| WAL Mode | Enabled | ✅ Good |
| Foreign Keys | Enabled | ✅ Good |
| Indexes | sync_status, deleted_at | ✅ Adequate |
| Query Patterns | Full table decrypt | ⚠️ Consider selective queries |

**Issue: All Records Decrypted on Every Read**
In `getAllRecords()`, every record's `data` field is decrypted:
```typescript
return Promise.all(rows.map((row: any) => decryptRecord<T>(key, { iv: row.iv, data: row.data })));
```
For a user with 5 years of expense data (thousands of records), this decrypts ALL records even if displaying only the current month.

**Fix:** Add pagination or date filtering at the SQL level before decryption.

### Remote PostgreSQL

| Table | Expected Rows | Indexes | Notes |
|---|---|---|---|
| kk_family_members | < 50 | local_id (unique) | ✅ Good |
| kk_income_entries | < 10K/year | local_id (unique), entry_date | ⚠️ Add entry_date index |
| kk_expense_entries | < 20K/year | local_id (unique), entry_date, category_idx | ⚠️ Add composite index |
| kk_sync_log | < 1K | id (PK) | ✅ Good |

---

## Performance Optimization Roadmap

### Quick Wins (1-2 days each)
1. ✅ Remove unused `@tanstack/react-query` dependency
2. ✅ Lazy-load `jspdf` and `xlsx` in export screen
3. ✅ Add `React.memo` to FlatList items
4. ✅ Add `useCallback` to handlers and `useMemo` to derivations

### Medium Effort (3-5 days each)
1. Replace `victory-native` with custom SVG charts
2. Add server-side pagination to admin user list
3. Add date-range filtering before decryption in CRUD queries
4. Add network connectivity check before sync

### High Effort (1-2 weeks each)
1. Full transition to React Query for data management
2. Add compression to sync payloads
3. Implement proper code splitting with lazy loading

---

## Performance Budget

| Metric | Current (est.) | Target |
|---|---|---|
| App startup time | ~3s cold start | < 1.5s |
| Dashboard render | ~1.5s (with data) | < 500ms |
| List scroll (100 items) | ~30fps | 60fps |
| Sync (100 records) | ~5s | < 2s |
| Export to PDF | ~3s | < 1s |
| Admin page load | ~500ms | < 200ms |
| Bundle size (APK) | ~5MB | < 3MB |

---

## Conclusion

KutumbKosh's performance is adequate for current scale but will degrade as users accumulate more data. The main areas for optimization are:
1. **Bundle size**: Remove unused dependencies, lazy-load heavy ones
2. **Render performance**: Add memoization to reduce re-renders  
3. **Data efficiency**: Filter at SQL level before decryption
4. **Caching**: Use React Query and server-side caching

The quick wins (1-2 days) can yield ~40% improvement in perceived performance. The high-effort items will be necessary as the user base grows beyond 1000 records per user.

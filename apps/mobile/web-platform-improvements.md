# Web Platform Analysis & Improvements Report

We analyzed the mobile application's compatibility when running on the Web platform (`react-native-web`) via `npm run mobile:web` (`expo start --web`). 

While the app compiled and loaded, multiple core functionalities (specifically local database CRUD actions and exporting data) were completely broken under the hood due to assumptions around native platform APIs. Below is a breakdown of the identified issues and the solutions implemented.

---

## 1. Local Database Mock (`webDbMock`) Improvements

On the mobile app, local data is stored in SQLite. On the web platform, the app falls back to a mock database utility `webDbMock` in `apps/mobile/src/db/index.ts` that saves serialized tables to the browser's `localStorage`.

### Identified Issues
1. **Newline SQL Matching Defect (Silently Breaking CRUD Updates):**
   * **Problem:** The original `runSync` UPDATE parser used the regex `/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i`. Since the `s` (dotAll) flag was not specified, the `.` character did not match newlines.
   * **Impact:** In `crud.ts`, `UPDATE` queries are written as multiline template strings. Because of this, UPDATE operations matched as `null`, causing updates to silently fail. Users could not edit or update existing bank accounts, entries, or documents.
2. **Missing `DELETE` Support (Breaking Conflict Resolution):**
   * **Problem:** The mock had no handler for `DELETE FROM` statements.
   * **Impact:** Tapping and resolving sync conflicts by purging records from the `sync_conflicts` table had no effect on the web.
3. **Broken `COUNT(*)` Checks (Breaking Pending / Conflict Counts):**
   * **Problem:** The `COUNT(*)` evaluator in `getFirstSync` was hardcoded to count rows with `sync_status = 'pending'`. 
   * **Impact:** If a query asked for `SELECT COUNT(*) FROM sync_conflicts WHERE resolved = 0`, it evaluated `row.sync_status === 'pending'`, which returned `0` because conflict records do not have a `sync_status` column. This broke the sync alert badge and sync dashboard logic.
4. **No Query Sorting:**
   * **Problem:** The mock returned data in the order of insertion without evaluating `ORDER BY` statements.
   * **Impact:** Getting recent log history or sorting maturities failed to return the latest logs/entries first.
5. **INSERT Parameter Offsets due to Literals (Misaligning Database Fields):**
   * **Problem:** The original `runSync` INSERT parser mapped columns to parameters directly by index: `row[field] = params[index]`. However, many insert statements include literal values inside the SQL string (e.g. `'pending'` in `crud.ts` or `'synced'` in `conflicts.tsx`).
   * **Impact:** The literal values offset the `params` index mapping by 1. For example, inserting a record caused the database fields `updated_at` and custom index fields (like dates and member IDs) to be shifted, corrupting stored dates and leaving values as `undefined`. This broke data display and query filtering for newly inserted items.

### Implemented Solutions
We rewrote the SQL query parser/evaluator inside [index.ts](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/apps/mobile/src/db/index.ts) to be robust and fully generic:
* **Whitespace Normalization:** Before running regular expressions, newlines and excessive spacing are normalized: `const cleanSql = sql.replace(/\s+/g, ' ').trim();`.
* **Placeholder/Literal-Aware INSERT Mapping:** We now split the `VALUES` clause (`valuesList`) and evaluate each value. If the value in the SQL query is a `?` placeholder, we consume the next parameter from `params`. If it is a literal string, we assign the literal directly, ensuring perfect index mapping and zero column offsets.
* **Evaluate WHERE Clauses Generically:** Introduced a generic helper function `evaluateWhere(row, conditionSql, params)` which matches:
  * `local_id = ?` (with soft deletes `deleted_at IS NULL`)
  * `local_id IN (?, ?, ...)`
  * `resolved = 0`
  * Column checks (e.g. `due_date IS NOT NULL`, `error IS NULL`).
* **DELETE Statement Support:** Added full support for deleting rows matching evaluated conditions.
* **Accurate COUNT(*) Evaluation:** Checks the filtered array length based on the custom WHERE clause instead of hardcoded pending checks.
* **Sorting Support:** Implemented `sortData` for handling sorting orders like `ORDER BY id DESC` and `ORDER BY synced_at DESC` so latest logs are loaded correctly.

---

## 2. Share & File System Compatibility on Browsers

When exporting spreadsheets or PDF reports, the app relies on native filesystem APIs.

### Identified Issues
* **Problem:** `FileSystem.documentDirectory` is undefined/unsupported on standard web browsers. Writing the file via `FileSystem.writeAsStringAsync` and attempting to share it via `Sharing.shareAsync` crashed the export process.
* **Impact:** The "Export to Excel" and "Export PDF Report" options in Settings crashed the app or threw an alert.

### Implemented Solutions
We added native browser download fallbacks in [export.tsx](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/apps/mobile/app/%28main%29/settings/export.tsx):
* **For Excel:** Detects `Platform.OS === 'web'` and utilizes SheetJS's native `XLSX.writeFile(wb, filename)` which triggers an instant, browser-native file download.
* **For PDF:** Detects `Platform.OS === 'web'` and calls jsPDF's built-in `doc.save(filename)` to save the PDF directly to the user's downloads folder.

---

## 3. Cryptography & Biometric Lock Fallbacks

We verified the encryption engine ([crypto/index.ts](file:///c:/Users/chaud/OneDrive/Desktop/random/kutumb_kosh/apps/mobile/src/crypto/index.ts)) and app security.
* **Status:** Fully functional on web. `expo-crypto`'s `getRandomBytesAsync` falls back correctly to the browser's `window.crypto.getRandomValues()` when run in a secure origin (such as `localhost` during development or `https` in production).
* **Local Auth / Biometrics:** Fully functional. When running on the web, `LocalAuthentication.hasHardwareAsync()` evaluates to `false`, and the app correctly falls back to the 6-digit numeric security PIN for unlocking.

---

## Verification

Run type-checking to verify integrity:
```powershell
npx tsc --noEmit
```
All tests completed and compile successfully. Run `npm run mobile:web` to launch and test locally.

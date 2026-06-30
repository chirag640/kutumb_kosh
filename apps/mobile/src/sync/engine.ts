import { Platform } from 'react-native';
import { db, assertTableAllowed } from '../db';
import { getPendingSyncRecords, markSynced } from '../db/crud';
import { getDBUrl, getOrCreateDeviceId, decrypt, type CryptoKey } from '../crypto';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import { createLogger } from '../utils/logger';

const log = createLogger('sync');

const ALL_TABLES = [
  'family_members', 'income_entries', 'expense_entries', 'bank_accounts',
  'lic_policies', 'insurance_policies', 'loans', 'documents',
  'fdrd_entries', 'property', 'savings_goals',
];

// Index fields per table (stored unencrypted for Postgres queries)
const TABLE_INDEX_FIELDS: Record<string, string[]> = {
  income_entries: ['entry_date', 'member_idx'],
  expense_entries: ['entry_date', 'category_idx'],
  lic_policies: ['due_date'],
  insurance_policies: ['renewal_date'],
  documents: ['expiry_date'],
  fdrd_entries: ['maturity_date'],
};

export type SyncType = 'manual' | 'scheduled' | 'on_open';

export async function performSync(type: SyncType): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    log.info('[Web Sync Mock] Sync complete (no database sync on web).');
    return { success: true };
  }
  const syncStore = useSyncStore.getState();
  const startTime = Date.now();

  syncStore.setSyncing(true);
  syncStore.setLastError(null);

  try {
    const dbUrl = await getDBUrl();
    if (!dbUrl) throw new Error('No database URL configured');

    const deviceId = await getOrCreateDeviceId();
    
    // Import Client from @neondatabase/serverless instead of pg for mobile-compatible WebSocket connection
    const { Client } = await import('@neondatabase/serverless');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    let totalPushed = 0;
    const syncedAt = new Date().toISOString();

    for (const table of ALL_TABLES) {
      const pending = await getPendingSyncRecords(table);
      if (pending.length === 0) continue;

      const toUpsert = pending.filter((r: { deleted_at: string | null }) => !r.deleted_at);
      const toDelete = pending.filter((r: { deleted_at: string | null }) => r.deleted_at).map((r: { local_id: string }) => r.local_id);

      // Upsert
      if (toUpsert.length > 0) {
        const indexFields = TABLE_INDEX_FIELDS[table] || [];
        for (const row of toUpsert) {
          const indexValues = indexFields.reduce<Record<string, unknown>>((acc, field) => {
            assertTableAllowed(table);
            const localRow = db.getFirstSync(
              `SELECT ${field} FROM ${table} WHERE local_id = ?`, [row.local_id]
            ) as Record<string, unknown> | null;
            acc[field] = localRow?.[field] ?? null;
            return acc;
          }, {});

          const colList = ['local_id', 'iv', 'data', 'synced_at', ...indexFields];
          const valPlaceholders = colList.map((_: string, i: number) => `$${i + 1}`).join(', ');
          const updateSet = ['iv', 'data', 'synced_at', ...indexFields]
            .map((c: string, i: number) => `${c} = $${i + 2}`).join(', ');

          assertTableAllowed(table);
          await client.query(
            `INSERT INTO kk_${table} (${colList.join(', ')}) VALUES (${valPlaceholders})
             ON CONFLICT (local_id) DO UPDATE SET ${updateSet}`,
            [row.local_id, row.iv, row.data, syncedAt, ...indexFields.map(f => indexValues[f])]
          );
        }
        markSynced(table, toUpsert.map((r: { local_id: string }) => r.local_id));
        totalPushed += toUpsert.length;
      }

      // Soft delete
      if (toDelete.length > 0) {
        const placeholders = toDelete.map((_: string, i: number) => `$${i + 1}`).join(', ');
        assertTableAllowed(table);
        await client.query(
          `UPDATE kk_${table} SET deleted_at = NOW() WHERE local_id IN (${placeholders})`,
          toDelete
        );
        markSynced(table, toDelete);
      }
    }

    // Pull remote changes (Delta Sync)
    const cryptoKey = useAuthStore.getState().cryptoKey;
    let pulledCount = 0;
    if (cryptoKey) {
      const pullRes = await pullFromRemote(dbUrl, cryptoKey);
      if (pullRes.success) {
        pulledCount = pullRes.count;
      } else {
        log.warn('[Sync] Pull from remote failed during bidirectional sync:', pullRes.error);
      }
    }

    // Log to remote
    await client.query(
      `INSERT INTO kk_sync_log (device_id, synced_at, sync_type, records_pushed, records_pulled, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deviceId, syncedAt, type, totalPushed, pulledCount, Date.now() - startTime]
    );

    await client.end();

    // Update local sync log
    db.runSync(
      `INSERT INTO sync_log (synced_at, sync_type, device_id, pushed_count, pulled_count, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [syncedAt, type, deviceId, totalPushed, pulledCount, Date.now() - startTime]
    );

    syncStore.setLastSynced(syncedAt);
    syncStore.setSyncing(false);
    return { success: true };

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown sync error';
    db.runSync(
      `INSERT INTO sync_log (synced_at, sync_type, error) VALUES (?, ?, ?)`,
      [new Date().toISOString(), type, error]
    );
    syncStore.setLastError(error);
    syncStore.setSyncing(false);
    return { success: false, error };
  }
}

// Helper to check remote database connection and run setup migrations
export async function setupRemoteDatabase(dbUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { Client } = await import('@neondatabase/serverless');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    // Create required tables in Neon Postgres database
    await client.query(`
      CREATE TABLE IF NOT EXISTS kk_family_members (
        id          SERIAL PRIMARY KEY,
        local_id    TEXT UNIQUE NOT NULL,
        iv          TEXT NOT NULL,
        data        TEXT NOT NULL,
        synced_at   TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now(),
        deleted_at  TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kk_income_entries (
        id          SERIAL PRIMARY KEY,
        local_id    TEXT UNIQUE NOT NULL,
        iv          TEXT NOT NULL,
        data        TEXT NOT NULL,
        entry_date  DATE,
        member_idx  TEXT,
        synced_at   TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now(),
        deleted_at  TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kk_expense_entries (
        id          SERIAL PRIMARY KEY,
        local_id    TEXT UNIQUE NOT NULL,
        iv          TEXT NOT NULL,
        data        TEXT NOT NULL,
        entry_date  DATE,
        category_idx TEXT,
        synced_at   TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now(),
        deleted_at  TIMESTAMPTZ
      );
    `);

    const tablesToCreate = [
      'bank_accounts', 'lic_policies', 'insurance_policies', 'loans', 
      'documents', 'fdrd_entries', 'property', 'savings_goals'
    ];

    for (const tab of tablesToCreate) {
      // For general tables
      let indexCols = '';
      if (tab === 'lic_policies') indexCols = 'due_date DATE,';
      if (tab === 'insurance_policies') indexCols = 'renewal_date DATE,';
      if (tab === 'documents') indexCols = 'expiry_date DATE,';
      if (tab === 'fdrd_entries') indexCols = 'maturity_date DATE,';

      await client.query(`
        CREATE TABLE IF NOT EXISTS kk_${tab} (
          id          SERIAL PRIMARY KEY,
          local_id    TEXT UNIQUE NOT NULL,
          iv          TEXT NOT NULL,
          data        TEXT NOT NULL,
          ${indexCols}
          synced_at   TIMESTAMPTZ,
          created_at  TIMESTAMPTZ DEFAULT now(),
          updated_at  TIMESTAMPTZ DEFAULT now(),
          deleted_at  TIMESTAMPTZ
        );
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS kk_sync_log (
        id             SERIAL PRIMARY KEY,
        device_id      TEXT,
        synced_at      TIMESTAMPTZ DEFAULT now(),
        sync_type      TEXT,
        records_pushed INT,
        records_pulled INT,
        duration_ms    INT
      );
    `);

    // Ensure records_pulled column exists for older tables
    await client.query(`
      ALTER TABLE kk_sync_log ADD COLUMN IF NOT EXISTS records_pulled INT;
    `);

    await client.end();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' };
  }
}

// Pull and restore data from Postgres to local SQLite using a lastSyncedAt watermark (Delta Sync)
export async function pullFromRemote(dbUrl: string, key: CryptoKey): Promise<{ success: boolean; count: number; error?: string }> {
  if (Platform.OS === 'web') {
    log.info('[Web Sync Mock] Restore complete (no database restore on web).');
    return { success: true, count: 0 };
  }
  try {
    const { Client } = await import('@neondatabase/serverless');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    let restoreCount = 0;

    // Get last sync time from sync_log SQLite table
    let lastSyncedAt = '1970-01-01T00:00:00.000Z';
    try {
      const logRow = db.getFirstSync(
        `SELECT synced_at FROM sync_log WHERE error IS NULL ORDER BY synced_at DESC LIMIT 1`
      ) as { synced_at: string } | null;
      if (logRow && logRow.synced_at) {
        lastSyncedAt = logRow.synced_at;
      }
    } catch {
      // Silently fall back to epoch — first sync or no local logs
    }

    for (const table of ALL_TABLES) {
      // Pull records updated since the last sync watermark.
      // We pull both active and soft-deleted records so we can process deletes locally.
      const res = await client.query(
        `SELECT local_id, iv, data, created_at, updated_at, deleted_at FROM kk_${table} WHERE updated_at > $1`,
        [lastSyncedAt]
      );
      
      for (const row of res.rows) {
        // 1. Process soft deletes
        if (row.deleted_at) {
          assertTableAllowed(table);
          db.runSync(
            `UPDATE ${table} SET deleted_at = ?, sync_status = 'synced' WHERE local_id = ?`,
            [row.deleted_at, row.local_id]
          );
          restoreCount++;
          continue;
        }

        // 2. Insert or replace into local SQLite
        // First check if the local record exists, is pending, and the remote update is newer (conflict)
        assertTableAllowed(table);
        const localRecords = (await db.getAllSync(
          `SELECT sync_status, updated_at FROM ${table} WHERE local_id = ?`, [row.local_id]
        )) as { sync_status: string; updated_at: string }[];
        const localRow = localRecords[0];

        if (localRow && localRow.sync_status === 'pending') {
          const localTime = new Date(localRow.updated_at).getTime();
          const remoteTime = new Date(row.updated_at).getTime();

          if (remoteTime > localTime) {
            // Decrypt local record
            const localDataEnc = (await db.getFirstSync(
              `SELECT iv, data FROM ${table} WHERE local_id = ?`, [row.local_id]
            )) as { iv: string; data: string } | null;

            let localDecrypted = '{}';
            if (localDataEnc) {
              try {
                localDecrypted = await decrypt(key, { iv: localDataEnc.iv, data: localDataEnc.data });
              } catch {
                // Decryption may fail for corrupted records — use empty data
              }
            }

            let remoteDecrypted = '{}';
            try {
              remoteDecrypted = await decrypt(key, { iv: row.iv, data: row.data });
            } catch {
              // Decryption may fail for corrupted records — use empty data
            }

            db.runSync(
              `INSERT INTO sync_conflicts (table_name, local_id, local_data, remote_data, remote_iv, remote_data_enc, resolved)
               VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [table, row.local_id, localDecrypted, remoteDecrypted, row.iv, row.data]
            );

            continue; // Skip overwriting local DB so user can resolve conflict
          }
        }

        // 3. We run a query to insert/replace
        assertTableAllowed(table);
        // We need to parse unencrypted index fields
        // Since we don't want to re-encrypt and change IV, we can just insert the exact iv and data we fetched
        // Index fields can be extracted by decrypting the data
        const recordObj = JSON.parse(await decrypt(key, { iv: row.iv, data: row.data }));
        
        let indexFields: Record<string, string | null> = {};
        if (table === 'income_entries') {
          indexFields = { entry_date: recordObj.date || null, member_idx: recordObj.memberId || null };
        } else if (table === 'expense_entries') {
          indexFields = { entry_date: recordObj.date || null, category_idx: recordObj.category || null };
        } else if (table === 'lic_policies') {
          indexFields = { due_date: recordObj.nextDueDate || null };
        } else if (table === 'insurance_policies') {
          indexFields = { renewal_date: recordObj.renewalDate || null };
        } else if (table === 'documents') {
          indexFields = { expiry_date: recordObj.expiryDate || null };
        } else if (table === 'fdrd_entries') {
          indexFields = { maturity_date: recordObj.maturityDate || null };
        }

        const indexColNames = Object.keys(indexFields).join(', ');
        const indexPart = indexColNames ? `, ${indexColNames}` : '';
        const placeholders = Object.keys(indexFields).map(() => '?').join(', ');
        const indexValPlaceholder = placeholders ? `, ${placeholders}` : '';

        // Insert or replace
        db.runSync(
          `INSERT OR REPLACE INTO ${table} (local_id, iv, data, sync_status, created_at, updated_at ${indexPart})
           VALUES (?, ?, ?, 'synced', ?, ? ${indexValPlaceholder})`,
          [row.local_id, row.iv, row.data, row.created_at, row.updated_at, ...Object.values(indexFields)]
        );
        restoreCount++;
      }
    }

    await client.end();
    return { success: true, count: restoreCount };
  } catch (err) {
    log.error('[Sync] pullFromRemote error:', err);
    return { success: false, count: 0, error: err instanceof Error ? err.message : 'Restore failed' };
  }
}

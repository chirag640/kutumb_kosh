import { db, assertTableAllowed } from './index';
import { encrypt, decrypt, encryptRecord, decryptRecord, type EncryptedBlob, type CryptoKey } from '../crypto';
import { randomUUID } from 'expo-crypto';
import { useSyncStore } from '../store/syncStore';

// Generic CRUD — all tables use same pattern

export async function insertRecord<T>(
  table: string,
  record: T,
  key: CryptoKey,
  indexFields: Record<string, string | null> = {}
): Promise<string> {
  const now = new Date().toISOString();
  const localId = (record as Record<string, unknown>).localId as string || randomUUID();
  const blob = await encryptRecord(key, { ...record, localId, createdAt: now, updatedAt: now });

  const indexColNames = Object.keys(indexFields).join(', ');
  const indexColValues = Object.values(indexFields).map(() => '?').join(', ');
  const indexColPlaceholder = indexColNames ? `, ${indexColNames}` : '';
  const indexValPlaceholder = indexColValues ? `, ${indexColValues}` : '';

  assertTableAllowed(table);
  db.runSync(
    `INSERT INTO ${table} (local_id, iv, data, sync_status, created_at, updated_at ${indexColPlaceholder})
     VALUES (?, ?, ?, 'pending', ?, ? ${indexValPlaceholder})`,
    [localId, blob.iv, blob.data, now, now, ...Object.values(indexFields)]
  );
  // Background sync trigger — debounced via isSyncing guard
  if (process.env.NODE_ENV !== 'test') {
    import('../sync/engine').then(({ performSync }) => {
      if (!useSyncStore.getState().isSyncing) {
        performSync('manual').catch(() => {});
      }
    });
  }
  return localId;
}

export async function updateRecord<T>(
  table: string,
  localId: string,
  record: T,
  key: CryptoKey,
  indexFields: Record<string, string | null> = {}
): Promise<void> {
  const now = new Date().toISOString();
  const blob = await encryptRecord(key, { ...record, localId, updatedAt: now });

  const indexUpdates = Object.keys(indexFields).map(k => `${k} = ?`).join(', ');
  const indexPart = indexUpdates ? `, ${indexUpdates}` : '';

  assertTableAllowed(table);
  db.runSync(
    `UPDATE ${table} SET iv = ?, data = ?, sync_status = 'pending', updated_at = ? ${indexPart}
     WHERE local_id = ? AND deleted_at IS NULL`,
    [blob.iv, blob.data, now, ...Object.values(indexFields), localId]
  );
  // Background sync trigger — debounced via isSyncing guard
  if (process.env.NODE_ENV !== 'test') {
    import('../sync/engine').then(({ performSync }) => {
      if (!useSyncStore.getState().isSyncing) {
        performSync('manual').catch(() => {});
      }
    });
  }
}

export async function deleteRecord(table: string, localId: string): Promise<void> {
  const now = new Date().toISOString();
  assertTableAllowed(table);
  db.runSync(
    `UPDATE ${table} SET deleted_at = ?, sync_status = 'pending' WHERE local_id = ?`,
    [now, localId]
  );
  // Background sync trigger — debounced via isSyncing guard
  if (process.env.NODE_ENV !== 'test') {
    import('../sync/engine').then(({ performSync }) => {
      if (!useSyncStore.getState().isSyncing) {
        performSync('manual').catch(() => {});
      }
    });
  }
}

export async function getAllRecords<T>(
  table: string,
  key: CryptoKey,
  whereClause = '',
  params: (string | number)[] = []
): Promise<T[]> {
  assertTableAllowed(table);
  const rows = db.getAllSync(
    `SELECT iv, data FROM ${table} WHERE deleted_at IS NULL ${whereClause}`,
    params
  ) as { iv: string; data: string }[];
  return Promise.all(rows.map((row: { iv: string; data: string }) => decryptRecord<T>(key, { iv: row.iv, data: row.data })));
}

export async function getPendingSyncRecords(table: string) {
  assertTableAllowed(table);
  return db.getAllSync(
    `SELECT local_id, iv, data, created_at, updated_at, deleted_at
     FROM ${table} WHERE sync_status = 'pending'`
  ) as { local_id: string; iv: string; data: string; created_at: string; updated_at: string; deleted_at: string | null }[];
}

export function markSynced(table: string, localIds: string[]): void {
  if (localIds.length === 0) return;
  assertTableAllowed(table);
  const placeholders = localIds.map(() => '?').join(',');
  db.runSync(
    `UPDATE ${table} SET sync_status = 'synced' WHERE local_id IN (${placeholders})`,
    localIds
  );
}

export function getRawTableRecords(table: string): any[] {
  assertTableAllowed(table);
  return db.getAllSync(`SELECT * FROM ${table}`);
}

export function restoreRawRecord(
  table: string,
  row: {
    local_id: string;
    iv: string;
    data: string;
    sync_status: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    [key: string]: any;
  }
): void {
  assertTableAllowed(table);
  
  const standardCols = new Set(['id', 'local_id', 'iv', 'data', 'sync_status', 'created_at', 'updated_at', 'deleted_at']);
  const indexFields: Record<string, any> = {};
  Object.keys(row).forEach(key => {
    if (!standardCols.has(key)) {
      indexFields[key] = row[key];
    }
  });

  const indexColNames = Object.keys(indexFields).join(', ');
  const indexColPlaceholder = indexColNames ? `, ${indexColNames}` : '';
  const indexValPlaceholder = Object.keys(indexFields).map(() => '?').join(', ');
  const indexPlaceholderPart = indexValPlaceholder ? `, ${indexValPlaceholder}` : '';

  db.runSync(
    `INSERT OR REPLACE INTO ${table} (local_id, iv, data, sync_status, created_at, updated_at, deleted_at ${indexColPlaceholder})
     VALUES (?, ?, ?, ?, ?, ?, ? ${indexPlaceholderPart})`,
    [
      row.local_id,
      row.iv,
      row.data,
      row.sync_status || 'pending',
      row.created_at,
      row.updated_at,
      row.deleted_at,
      ...Object.values(indexFields)
    ]
  );
}

export function hasRecord(table: string, localId: string): boolean {
  assertTableAllowed(table);
  const row = db.getFirstSync(`SELECT 1 FROM ${table} WHERE local_id = ?`, [localId]);
  return !!row;
}

export function clearTable(table: string): void {
  assertTableAllowed(table);
  db.runSync(`DELETE FROM ${table}`);
}

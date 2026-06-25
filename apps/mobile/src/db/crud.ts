import { db } from './index';
import { encrypt, decrypt, encryptRecord, decryptRecord, type EncryptedBlob, type CryptoKey } from '../crypto';
import { randomUUID } from 'expo-crypto';

// Generic CRUD — all tables use same pattern

export async function insertRecord<T>(
  table: string,
  record: T,
  key: CryptoKey,
  indexFields: Record<string, string | null> = {}
): Promise<string> {
  const now = new Date().toISOString();
  const localId = (record as any).localId || randomUUID();
  const blob = await encryptRecord(key, { ...record, localId, createdAt: now, updatedAt: now });

  const indexColNames = Object.keys(indexFields).join(', ');
  const indexColValues = Object.values(indexFields).map(() => '?').join(', ');
  const indexColPlaceholder = indexColNames ? `, ${indexColNames}` : '';
  const indexValPlaceholder = indexColValues ? `, ${indexColValues}` : '';

  db.runSync(
    `INSERT INTO ${table} (local_id, iv, data, sync_status, created_at, updated_at ${indexColPlaceholder})
     VALUES (?, ?, ?, 'pending', ?, ? ${indexValPlaceholder})`,
    [localId, blob.iv, blob.data, now, now, ...Object.values(indexFields)]
  );
  // Background sync trigger
  import('../sync/engine').then(({ performSync }) => {
    performSync('manual').catch(err => console.log('Auto-sync failed:', err));
  });
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

  db.runSync(
    `UPDATE ${table} SET iv = ?, data = ?, sync_status = 'pending', updated_at = ? ${indexPart}
     WHERE local_id = ? AND deleted_at IS NULL`,
    [blob.iv, blob.data, now, ...Object.values(indexFields), localId]
  );
  // Background sync trigger
  import('../sync/engine').then(({ performSync }) => {
    performSync('manual').catch(err => console.log('Auto-sync failed:', err));
  });
}

export async function deleteRecord(table: string, localId: string): Promise<void> {
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE ${table} SET deleted_at = ?, sync_status = 'pending' WHERE local_id = ?`,
    [now, localId]
  );
  // Background sync trigger
  import('../sync/engine').then(({ performSync }) => {
    performSync('manual').catch(err => console.log('Auto-sync failed:', err));
  });
}

export async function getAllRecords<T>(
  table: string,
  key: CryptoKey,
  whereClause = '',
  params: (string | number)[] = []
): Promise<T[]> {
  const rows = db.getAllSync(
    `SELECT iv, data FROM ${table} WHERE deleted_at IS NULL ${whereClause}`,
    params
  ) as { iv: string; data: string }[];
  return Promise.all(rows.map((row: any) => decryptRecord<T>(key, { iv: row.iv, data: row.data })));
}

export async function getPendingSyncRecords(table: string) {
  return db.getAllSync(
    `SELECT local_id, iv, data, created_at, updated_at, deleted_at
     FROM ${table} WHERE sync_status = 'pending'`
  ) as { local_id: string; iv: string; data: string; created_at: string; updated_at: string; deleted_at: string | null }[];
}

export function markSynced(table: string, localIds: string[]): void {
  if (localIds.length === 0) return;
  const placeholders = localIds.map(() => '?').join(',');
  db.runSync(
    `UPDATE ${table} SET sync_status = 'synced' WHERE local_id IN (${placeholders})`,
    localIds
  );
}

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { initializeDB, db } from '../db';
import { performSync, pullFromRemote, setupRemoteDatabase } from '../sync/engine';
import { insertRecord, getRawTableRecords, clearTable, updateRecord } from '../db/crud';
import { deriveKey, getOrCreateSalt, encryptRecord } from '../crypto';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import {
  setPlatformOS,
  resetTestMocks,
  mockNeonQuery,
  mockNeonConnect,
  mockNeonEnd,
} from './setup';

describe('Sync Engine & Remote Bidirectional Synchronization', () => {
  let mockKey: Uint8Array;

  beforeAll(async () => {
    // Make sure DB structure is created
    setPlatformOS('web');
    initializeDB();
    const salt = await getOrCreateSalt();
    mockKey = await deriveKey('password123', salt);
  });

  beforeEach(() => {
    resetTestMocks();
    setPlatformOS('web');
    clearTable('family_members');
    clearTable('sync_log');
    clearTable('sync_conflicts');
    useAuthStore.getState().setKey(mockKey);
  });

  describe('setupRemoteDatabase', () => {
    it('should successfully run migrations on remote neon DB', async () => {
      const res = await setupRemoteDatabase('postgres://test:pass@host/db');
      expect(res.success).toBe(true);
      expect(mockNeonConnect).toHaveBeenCalled();
      expect(mockNeonQuery).toHaveBeenCalled();
      expect(mockNeonEnd).toHaveBeenCalled();
    });

    it('should fail and return error when database connection fails', async () => {
      mockNeonConnect.mockRejectedValueOnce(new Error('Connection timed out'));
      const res = await setupRemoteDatabase('postgres://test:pass@host/db');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Connection timed out');
    });
  });

  describe('performSync (Web Early Return)', () => {
    it('should immediately succeed without network call when on web platform', async () => {
      setPlatformOS('web');
      const res = await performSync('manual');
      expect(res.success).toBe(true);
      expect(mockNeonConnect).not.toHaveBeenCalled();
    });
  });

  describe('performSync (Mobile native logic)', () => {
    beforeEach(async () => {
      setPlatformOS('ios');
      // Must set the DB URL in secureStore mock first
      const { storeDBUrl } = await import('../crypto');
      await storeDBUrl('postgres://test:pass@host/db');
    });

    it('should fail if no DB URL is set', async () => {
      const { deleteItemAsync } = await import('../utils/secureStore');
      await deleteItemAsync('kk_db_url_v1'); // Remove DB URL

      const res = await performSync('manual');
      expect(res.success).toBe(false);
      expect(res.error).toBe('No database URL configured');
    });

    it('should push pending local records to remote Neon Postgres and pull updates', async () => {
      // 1. Insert a pending record locally
      const record = { name: 'Aarav pending sync', role: 'son' };
      const localId = await insertRecord('family_members', record, mockKey);

      // Verify it's pending in local SQLite
      const rawRowsBefore = getRawTableRecords('family_members');
      expect(rawRowsBefore[0].sync_status).toBe('pending');

      // 2. Perform Sync (Native Mode)
      const res = await performSync('manual');
      expect(res.success).toBe(true);

      // Verify Postgres client was connected to push updates
      expect(mockNeonConnect).toHaveBeenCalled();
      expect(mockNeonQuery).toHaveBeenCalled();

      // Verify the local record was marked as synced
      const rawRowsAfter = getRawTableRecords('family_members');
      expect(rawRowsAfter[0].sync_status).toBe('synced');

      // Verify local sync_log records the transaction
      const syncLogs = getRawTableRecords('sync_log');
      expect(syncLogs.length).toBe(1); // One success log
      expect(syncLogs[0].pushed_count).toBe(1);
    });

    it('should push soft-deleted records to remote', async () => {
      // 1. Insert and delete a local record
      const record = { name: 'To Delete' };
      const localId = await insertRecord('family_members', record, mockKey);
      const { deleteRecord } = await import('../db/crud');
      await deleteRecord('family_members', localId);

      // 2. Perform sync
      const res = await performSync('manual');
      expect(res.success).toBe(true);

      // Verify database update query was executed
      const softDeleteQueryCall = mockNeonQuery.mock.calls.find(c =>
        c[0].includes('UPDATE kk_family_members SET deleted_at')
      );
      expect(softDeleteQueryCall).toBeDefined();
      expect(softDeleteQueryCall?.[1]).toContain(localId);
    });
  });

  describe('pullFromRemote & Conflict Resolution', () => {
    beforeEach(async () => {
      setPlatformOS('ios');
    });

    it('should pull and insert remote records that are missing locally', async () => {
      const dbUrl = 'postgres://test:pass@host/db';
      const remoteRecord = { name: 'Grandfather', role: 'grandfather' };
      const blob = await encryptRecord(mockKey, remoteRecord);

      // Mock database SELECT query returning 1 new remote record
      mockNeonQuery.mockResolvedValueOnce({
        rows: [
          {
            local_id: 'remote-uuid-1',
            iv: blob.iv,
            data: blob.data,
            created_at: '2026-06-20T12:00:00Z',
            updated_at: '2026-06-20T12:00:00Z',
            deleted_at: null,
          },
        ],
      });

      const res = await pullFromRemote(dbUrl, mockKey);
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);

      // Verify the record was inserted into the local DB and synced
      const localRows = getRawTableRecords('family_members');
      expect(localRows.length).toBe(1);
      expect(localRows[0].local_id).toBe('remote-uuid-1');
      expect(localRows[0].sync_status).toBe('synced');
    });

    it('should soft-delete local records when pulled deleted_at timestamp from remote', async () => {
      const dbUrl = 'postgres://test:pass@host/db';
      const record = { name: 'Active User' };
      const localId = await insertRecord('family_members', record, mockKey);

      // Mock remote delete sync
      mockNeonQuery.mockResolvedValueOnce({
        rows: [
          {
            local_id: localId,
            iv: 'dummy',
            data: 'dummy',
            created_at: '2026-06-20T12:00:00Z',
            updated_at: '2026-06-21T12:00:00Z',
            deleted_at: '2026-06-21T12:00:00Z',
          },
        ],
      });

      const res = await pullFromRemote(dbUrl, mockKey);
      expect(res.success).toBe(true);

      const localRows = getRawTableRecords('family_members');
      expect(localRows[0].deleted_at).toBe('2026-06-21T12:00:00Z');
      expect(localRows[0].sync_status).toBe('synced');
    });

    it('should detect sync conflict when remote update is newer and local is pending', async () => {
      const dbUrl = 'postgres://test:pass@host/db';
      const localRecord = { name: 'Aarav Local', role: 'son' };

      // 1. Create a local pending record with updated_at in past
      const localId = await insertRecord('family_members', localRecord, mockKey);
      // Manually set local record updated_at to a past date
      db.runSync(
        `UPDATE family_members SET updated_at = ? WHERE local_id = ?`,
        ['2026-06-20T10:00:00.000Z', localId]
      );

      // 2. Create remote record with newer updated_at
      const remoteRecord = { name: 'Aarav Remote', role: 'son' };
      const blob = await encryptRecord(mockKey, remoteRecord);

      mockNeonQuery.mockResolvedValueOnce({
        rows: [
          {
            local_id: localId,
            iv: blob.iv,
            data: blob.data,
            created_at: '2026-06-20T10:00:00.000Z',
            updated_at: '2026-06-22T10:00:00.000Z', // Remote is newer
            deleted_at: null,
          },
        ],
      });

      const res = await pullFromRemote(dbUrl, mockKey);
      expect(res.success).toBe(true);

      // 3. Verify local SQLite was NOT overwritten
      const localRows = getRawTableRecords('family_members');
      expect(localRows[0].sync_status).toBe('pending'); // Still pending

      // 4. Verify conflict was logged to `sync_conflicts` table
      const conflicts = getRawTableRecords('sync_conflicts');
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].local_id).toBe(localId);
      expect(conflicts[0].table_name).toBe('family_members');
      expect(conflicts[0].local_data).toContain('Aarav Local');
      expect(conflicts[0].remote_data).toContain('Aarav Remote');
      expect(conflicts[0].resolved).toBe(0);
    });
  });
});

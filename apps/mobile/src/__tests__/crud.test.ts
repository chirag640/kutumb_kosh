import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { initializeDB } from '../db';
import {
  insertRecord,
  updateRecord,
  deleteRecord,
  getAllRecords,
  getPendingSyncRecords,
  markSynced,
  getRawTableRecords,
  restoreRawRecord,
  hasRecord,
  clearTable,
} from '../db/crud';
import { resetTestMocks } from './setup';

describe('Local DB CRUD Operations', () => {
  const mockKey = new Uint8Array(32).fill(7); // Mock 256-bit crypto key

  beforeAll(() => {
    // Set up table structures via alasql
    initializeDB();
  });

  beforeEach(() => {
    resetTestMocks();
    // Clear relevant tables to ensure test isolation
    clearTable('family_members');
    clearTable('income_entries');
  });

  describe('insertRecord & getAllRecords', () => {
    it('should successfully insert a record and read it back decrypted', async () => {
      const record = { name: 'Aarav Sharma', role: 'father', age: 42 };
      const localId = await insertRecord('family_members', record, mockKey);

      expect(localId).toBeDefined();
      expect(typeof localId).toBe('string');

      // Verify record is added and correctly decrypted
      const results = await getAllRecords<typeof record>('family_members', mockKey);
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Aarav Sharma');
      expect(results[0].role).toBe('father');
      expect(results[0].age).toBe(42);
      // CRUD automatically injects localId, createdAt, and updatedAt
      expect((results[0] as any).localId).toBe(localId);
      expect((results[0] as any).createdAt).toBeDefined();
      expect((results[0] as any).updatedAt).toBeDefined();
    });

    it('should insert records with index fields correctly', async () => {
      const income = { amount: 50000, date: '2026-06-01', memberId: 'mem_01' };
      const indexFields = { entry_date: income.date, member_idx: income.memberId };

      const localId = await insertRecord('income_entries', income, mockKey, indexFields);
      expect(localId).toBeDefined();

      const results = await getAllRecords<typeof income>('income_entries', mockKey);
      expect(results.length).toBe(1);
      expect(results[0].amount).toBe(50000);

      // Verify that raw database row has indexed columns set correctly
      const rawRows = getRawTableRecords('income_entries');
      expect(rawRows.length).toBe(1);
      expect(rawRows[0].entry_date).toBe('2026-06-01');
      expect(rawRows[0].member_idx).toBe('mem_01');
    });

    it('should throw an error for non-whitelisted table names', async () => {
      const record = { data: 'test' };
      await expect(
        insertRecord('malicious_table_name_here', record, mockKey)
      ).rejects.toThrow(/is not in the allowed list/);
    });
  });

  describe('updateRecord', () => {
    it('should update an existing record successfully', async () => {
      const record = { name: 'Kiran Sharma', role: 'mother' };
      const localId = await insertRecord('family_members', record, mockKey);

      const updatedRecord = { name: 'Kiran A. Sharma', role: 'mother' };
      await updateRecord('family_members', localId, updatedRecord, mockKey);

      const results = await getAllRecords<typeof record>('family_members', mockKey);
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Kiran A. Sharma');
    });

    it('should update index fields properly', async () => {
      const income = { amount: 20000, date: '2026-06-01', memberId: 'mem_01' };
      const indexFields = { entry_date: income.date, member_idx: income.memberId };
      const localId = await insertRecord('income_entries', income, mockKey, indexFields);

      // Update date and amount
      const updatedIncome = { amount: 25000, date: '2026-06-05', memberId: 'mem_01' };
      const updatedIndexFields = { entry_date: updatedIncome.date, member_idx: updatedIncome.memberId };
      await updateRecord('income_entries', localId, updatedIncome, mockKey, updatedIndexFields);

      const rawRows = getRawTableRecords('income_entries');
      expect(rawRows.length).toBe(1);
      expect(rawRows[0].entry_date).toBe('2026-06-05');
    });
  });

  describe('deleteRecord', () => {
    it('should soft-delete a record by setting deleted_at', async () => {
      const record = { name: 'John Doe' };
      const localId = await insertRecord('family_members', record, mockKey);

      expect(hasRecord('family_members', localId)).toBe(true);

      await deleteRecord('family_members', localId);

      // getAllRecords filters out deleted records by default (WHERE deleted_at IS NULL)
      const results = await getAllRecords<typeof record>('family_members', mockKey);
      expect(results.length).toBe(0);

      // Raw record still exists but sync_status is 'pending' and deleted_at is filled
      const rawRows = getRawTableRecords('family_members');
      expect(rawRows.length).toBe(1);
      expect(rawRows[0].deleted_at).not.toBeNull();
      expect(rawRows[0].sync_status).toBe('pending');
    });
  });

  describe('Sync Helper functions', () => {
    it('should find pending sync records', async () => {
      const record = { name: 'Pending User' };
      const localId = await insertRecord('family_members', record, mockKey);

      const pending = await getPendingSyncRecords('family_members');
      expect(pending.length).toBe(1);
      expect(pending[0].local_id).toBe(localId);
      expect(pending[0].sync_status).toBe(undefined); // Wait, select lists local_id, iv, data, created_at, updated_at, deleted_at (sync_status is not in columns returned by getPendingSyncRecords)
    });

    it('should update sync_status to synced', async () => {
      const record = { name: 'User to Sync' };
      const localId = await insertRecord('family_members', record, mockKey);

      let pending = await getPendingSyncRecords('family_members');
      expect(pending.length).toBe(1);

      markSynced('family_members', [localId]);

      pending = await getPendingSyncRecords('family_members');
      expect(pending.length).toBe(0); // No longer pending

      const rawRows = getRawTableRecords('family_members');
      expect(rawRows[0].sync_status).toBe('synced');
    });
  });

  describe('restoreRawRecord & hasRecord', () => {
    it('should check if a record exists and restore raw records', async () => {
      const localId = 'custom-uuid-1234';
      expect(hasRecord('family_members', localId)).toBe(false);

      const rawRow = {
        local_id: localId,
        iv: 'mock-iv-base64',
        data: 'mock-data-base64',
        sync_status: 'synced',
        created_at: '2026-06-28T00:00:00Z',
        updated_at: '2026-06-28T00:00:00Z',
        deleted_at: null,
      };

      restoreRawRecord('family_members', rawRow);
      expect(hasRecord('family_members', localId)).toBe(true);

      const rawRows = getRawTableRecords('family_members');
      expect(rawRows.length).toBe(1);
      expect(rawRows[0].local_id).toBe(localId);
      expect(rawRows[0].sync_status).toBe('synced');
    });
  });
});

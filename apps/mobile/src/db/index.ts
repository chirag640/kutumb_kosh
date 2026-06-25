import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

const getWebTable = (tableName: string): any[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(`kk_webdb_${tableName}`);
  return data ? JSON.parse(data) : [];
};

const saveWebTable = (tableName: string, data: any[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`kk_webdb_${tableName}`, JSON.stringify(data));
};

const webDbMock = {
  execSync(sql: string) {
    const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (createTableMatch) {
      const tableName = createTableMatch[1];
      if (typeof window !== 'undefined' && !localStorage.getItem(`kk_webdb_${tableName}`)) {
        saveWebTable(tableName, []);
      }
    }
  },

  runSync(sql: string, params: any[] = []) {
    // 1. Parse INSERT OR REPLACE / INSERT
    const insertMatch = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      const fields = insertMatch[2].split(',').map(f => f.trim());
      const row: any = {};
      fields.forEach((field, index) => {
        row[field] = params[index];
      });
      
      let tableData = getWebTable(tableName);
      if (row.local_id) {
        tableData = tableData.filter(r => r.local_id !== row.local_id);
      }
      tableData.push(row);
      saveWebTable(tableName, tableData);
      return;
    }

    // 2. Parse UPDATE
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
    if (updateMatch) {
      const tableName = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const assignments = setClause.split(',').map(s => s.trim());
      
      let tableData = getWebTable(tableName);

      if (whereClause.includes('local_id = ?')) {
        const localId = params[params.length - 1]; // last parameter is localId
        tableData = tableData.map(row => {
          if (row.local_id === localId) {
            let pIdx = 0;
            assignments.forEach(assign => {
              const parts = assign.split('=').map(x => x.trim());
              const col = parts[0];
              const val = parts[1];
              if (val === '?') {
                row[col] = params[pIdx++];
              } else {
                row[col] = val.replace(/['"]/g, '');
              }
            });
          }
          return row;
        });
      } else if (whereClause.includes('local_id IN')) {
        // markSynced
        const localIds = params;
        tableData = tableData.map(row => {
          if (localIds.includes(row.local_id)) {
            row.sync_status = 'synced';
          }
          return row;
        });
      }
      saveWebTable(tableName, tableData);
      return;
    }
  },

  getAllSync<T>(sql: string, params: any[] = []): T[] {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return [] as T[];
    const tableName = fromMatch[1];
    const tableData = getWebTable(tableName);
    
    if (sql.includes("sync_status = 'pending'")) {
      return tableData.filter(row => row.sync_status === 'pending') as T[];
    }
    if (sql.includes('deleted_at IS NULL')) {
      return tableData.filter(row => !row.deleted_at) as T[];
    }
    return tableData as T[];
  },

  getFirstSync<T>(sql: string, params: any[] = []): T | null {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return null;
    const tableName = fromMatch[1];
    const tableData = getWebTable(tableName);
    
    if (sql.includes('COUNT(*)')) {
      const count = tableData.filter(row => row.sync_status === 'pending').length;
      return { count } as any as T;
    }
    return (tableData[0] || null) as T | null;
  }
};

export const db = Platform.OS === 'web'
  ? webDbMock as any
  : SQLite.openDatabaseSync('kutumbkosh.db');

export function initializeDB(): void {
  db.execSync(`PRAGMA journal_mode = WAL;`);
  db.execSync(`PRAGMA foreign_keys = ON;`);

  // Template for all tables — same structure repeated for each entity
  const createTable = (name: string, extraIndexCols = '') => `
    CREATE TABLE IF NOT EXISTS ${name} (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id    TEXT UNIQUE NOT NULL,
      iv          TEXT NOT NULL,
      data        TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      ${extraIndexCols}
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_${name}_sync ON ${name}(sync_status);
    CREATE INDEX IF NOT EXISTS idx_${name}_deleted ON ${name}(deleted_at);
  `;

  db.execSync(createTable('family_members'));
  db.execSync(createTable('income_entries', 'entry_date TEXT, member_idx TEXT,'));
  db.execSync(createTable('expense_entries', 'entry_date TEXT, category_idx TEXT,'));
  db.execSync(createTable('bank_accounts'));
  db.execSync(createTable('lic_policies', 'due_date TEXT,'));
  db.execSync(createTable('insurance_policies', 'renewal_date TEXT,'));
  db.execSync(createTable('loans'));
  db.execSync(createTable('documents', 'expiry_date TEXT,'));
  db.execSync(createTable('fdrd_entries', 'maturity_date TEXT,'));
  db.execSync(createTable('property'));
  db.execSync(createTable('savings_goals'));

  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at    TEXT NOT NULL,
      sync_type    TEXT NOT NULL,
      device_id    TEXT,
      pushed_count INTEGER DEFAULT 0,
      pulled_count INTEGER DEFAULT 0,
      error        TEXT,
      duration_ms  INTEGER
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name      TEXT NOT NULL,
      local_id        TEXT NOT NULL,
      local_data      TEXT NOT NULL,
      remote_data     TEXT NOT NULL,
      remote_iv       TEXT NOT NULL,
      remote_data_enc TEXT NOT NULL,
      resolved        INTEGER DEFAULT 0
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

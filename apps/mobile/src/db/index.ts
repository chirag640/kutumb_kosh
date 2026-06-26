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

function evaluateWhere(row: any, conditionSql: string, params: any[]): boolean {
  const sql = conditionSql.replace(/\s+/g, ' ').trim();
  
  if (sql.includes('local_id = ?') && sql.includes('deleted_at IS NULL')) {
    const localId = params[0];
    return row.local_id === localId && !row.deleted_at;
  }
  if (sql.includes('local_id = ?')) {
    const localId = params[0];
    return row.local_id === localId;
  }
  if (sql.includes('id = ?')) {
    const id = params[0];
    return Number(row.id) === Number(id) || row.local_id === id; 
  }
  if (sql.includes('local_id IN')) {
    return params.includes(row.local_id);
  }
  if (sql.includes('resolved = 0')) {
    return !row.resolved || Number(row.resolved) === 0;
  }
  
  let match = true;
  if (sql.includes('deleted_at IS NULL')) {
    match = match && !row.deleted_at;
  }
  if (sql.includes('due_date IS NOT NULL')) {
    match = match && row.due_date !== null && row.due_date !== undefined;
  }
  if (sql.includes('renewal_date IS NOT NULL')) {
    match = match && row.renewal_date !== null && row.renewal_date !== undefined;
  }
  if (sql.includes('expiry_date IS NOT NULL')) {
    match = match && row.expiry_date !== null && row.expiry_date !== undefined;
  }
  if (sql.includes('error IS NULL')) {
    match = match && !row.error;
  }
  if (sql.includes("sync_status = 'pending'")) {
    match = match && row.sync_status === 'pending';
  }
  return match;
}

function sortData(data: any[], sql: string): any[] {
  const sorted = [...data];
  if (sql.includes('ORDER BY id DESC')) {
    sorted.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  } else if (sql.includes('ORDER BY synced_at DESC')) {
    sorted.sort((a, b) => new Date(b.synced_at || 0).getTime() - new Date(a.synced_at || 0).getTime());
  }
  return sorted;
}

const webDbMock = {
  execSync(sql: string) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    const createTableMatch = cleanSql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (createTableMatch) {
      const tableName = createTableMatch[1];
      if (typeof window !== 'undefined' && !localStorage.getItem(`kk_webdb_${tableName}`)) {
        saveWebTable(tableName, []);
      }
    }
  },

  runSync(sql: string, params: any[] = []) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    // 1. DELETE
    const deleteMatch = cleanSql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1];
      const condition = deleteMatch[2];
      let tableData = getWebTable(tableName);
      tableData = tableData.filter(row => !evaluateWhere(row, condition, params));
      saveWebTable(tableName, tableData);
      return;
    }

    // 2. INSERT / REPLACE
    const insertMatch = cleanSql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      const fields = insertMatch[2].split(',').map(f => f.trim());
      const row: any = {};
      
      let tableData = getWebTable(tableName);
      const currentMaxId = tableData.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
      row.id = currentMaxId + 1;

      fields.forEach((field, index) => {
        row[field] = params[index];
      });
      
      if (row.local_id) {
        tableData = tableData.filter(r => r.local_id !== row.local_id);
      }
      tableData.push(row);
      saveWebTable(tableName, tableData);
      return;
    }

    // 3. UPDATE
    const updateMatch = cleanSql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
    if (updateMatch) {
      const tableName = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const assignments = setClause.split(',').map(s => s.trim());
      
      let tableData = getWebTable(tableName);
      
      const setPlaceholderCount = (setClause.match(/\?/g) || []).length;
      const setParams = params.slice(0, setPlaceholderCount);
      const whereParams = params.slice(setPlaceholderCount);

      tableData = tableData.map(row => {
        if (evaluateWhere(row, whereClause, whereParams)) {
          let pIdx = 0;
          assignments.forEach(assign => {
            const parts = assign.split('=').map(x => x.trim());
            const col = parts[0];
            const val = parts[1];
            if (val === '?') {
              row[col] = setParams[pIdx++];
            } else {
              row[col] = val.replace(/['"]/g, '');
            }
          });
        }
        return row;
      });
      saveWebTable(tableName, tableData);
      return;
    }
  },

  getAllSync<T>(sql: string, params: any[] = []): T[] {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    const fromMatch = cleanSql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return [] as T[];
    const tableName = fromMatch[1];
    const tableData = getWebTable(tableName);
    
    const whereMatch = cleanSql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      const condition = whereMatch[1];
      let filtered = tableData.filter(row => evaluateWhere(row, condition, params));
      
      if (cleanSql.includes('ORDER BY')) {
        filtered = sortData(filtered, cleanSql);
      }
      return filtered as any as T[];
    }
    
    let result = tableData;
    if (cleanSql.includes('ORDER BY')) {
      result = sortData(result, cleanSql);
    }
    return result as any as T[];
  },

  getFirstSync<T>(sql: string, params: any[] = []): T | null {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    const fromMatch = cleanSql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return null;
    const tableName = fromMatch[1];
    let tableData = getWebTable(tableName);
    
    const whereMatch = cleanSql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      const condition = whereMatch[1];
      tableData = tableData.filter(row => evaluateWhere(row, condition, params));
    }
    
    if (cleanSql.includes('ORDER BY')) {
      tableData = sortData(tableData, cleanSql);
    }
    
    if (cleanSql.includes('COUNT(*)')) {
      const count = tableData.length;
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

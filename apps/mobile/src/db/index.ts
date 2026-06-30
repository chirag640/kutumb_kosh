import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import alasql from 'alasql';
import { createLogger } from '../utils/logger';

const log = createLogger('db');

// ─── Table Name Whitelist ─────────────────────────────────────────────────────
// All table names used in dynamic SQL queries must be in this set.
// This prevents SQL injection via table name interpolation.

export const ALLOWED_TABLES = new Set([
  'family_members',
  'income_entries',
  'expense_entries',
  'bank_accounts',
  'lic_policies',
  'insurance_policies',
  'loans',
  'documents',
  'fdrd_entries',
  'property',
  'savings_goals',
  'investments',
  'sync_log',
  'sync_conflicts',
  'app_settings',
]);

/**
 * Validates that a table name is in the allowed whitelist.
 * Throws if the table name is not allowed, preventing SQL injection
 * via ${table} interpolation in dynamic queries.
 */
export function assertTableAllowed(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Table "${table}" is not in the allowed list and cannot be used in queries.`);
  }
}

const getTableName = (sql: string): string | null => {
  const clean = sql.replace(/\s+/g, ' ').trim().toUpperCase();
  
  if (clean.includes('INSERT INTO')) {
    const m = sql.match(/INSERT\s+INTO\s+(\w+)/i);
    return m ? m[1] : null;
  }
  if (clean.includes('INSERT OR REPLACE INTO')) {
    const m = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)/i);
    return m ? m[1] : null;
  }
  if (clean.includes('INSERT OR IGNORE INTO')) {
    const m = sql.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)/i);
    return m ? m[1] : null;
  }
  if (clean.includes('UPDATE')) {
    const m = sql.match(/UPDATE\s+(\w+)/i);
    return m ? m[1] : null;
  }
  if (clean.includes('DELETE FROM')) {
    const m = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    return m ? m[1] : null;
  }
  return null;
};

const saveWebTable = (tableName: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const rows = alasql(`SELECT * FROM ${tableName}`);
    localStorage.setItem(`kk_webdb_${tableName}`, JSON.stringify(rows));
  } catch (err) {
    log.error(`Failed to save table ${tableName} to localStorage:`, err);
  }
};

const escapeSqlKeywords = (sql: string): string => {
  return sql
    .replace(/(?<!\b(?:primary|foreign)\s+)\bkey\b/gi, '[key]')
    .replace(/\bvalue\b/gi, '[value]');
};

export interface DatabaseConnection {
  execSync(sql: string): void;
  runSync(sql: string, params?: unknown[]): void;
  getAllSync<T>(sql: string, params?: unknown[]): T[];
  getFirstSync<T>(sql: string, params?: unknown[]): T | null;
}

const webDbMock = {
  execSync(sql: string) {
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      const cleanStmt = stmt.replace(/\s+/g, ' ').trim();
      if (cleanStmt.toUpperCase().startsWith('PRAGMA') || cleanStmt.toUpperCase().startsWith('CREATE INDEX')) {
        continue;
      }

      try {
        alasql(escapeSqlKeywords(cleanStmt));
      } catch (err) {
        log.error('alasql execSync error:', err, 'SQL:', cleanStmt);
      }

      const createTableMatch = cleanStmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (createTableMatch) {
        const tableName = createTableMatch[1];
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem(`kk_webdb_${tableName}`);
          if (stored) {
            try {
              const rows = JSON.parse(stored) as Record<string, unknown>[];
              rows.forEach((row: Record<string, unknown>) => {
                alasql(escapeSqlKeywords(`INSERT INTO ${tableName} VALUES ?`), [row]);
              });
            } catch (err) {
              log.error(`Failed to hydrate table ${tableName} from localStorage:`, err);
            }
          }
        }
      }
    }
  },

  runSync(sql: string, params: unknown[] = []) {
    let cleanSql = sql.replace(/\s+/g, ' ').trim();
    
    // Translate INSERT OR REPLACE
    if (cleanSql.toUpperCase().includes('INSERT OR REPLACE INTO')) {
      const match = cleanSql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1];
        const cols = match[2].split(',').map(c => c.trim());
        const localIdIndex = cols.indexOf('local_id');
        const keyIndex = cols.indexOf('key');

        if (localIdIndex !== -1) {
          const localId = params[localIdIndex];
          const exists = alasql(escapeSqlKeywords(`SELECT 1 FROM ${tableName} WHERE local_id = ?`), [localId]) as unknown[];
          if (exists && exists.length > 0) {
            const setClauses = cols.filter(c => c !== 'local_id').map(c => `${c} = ?`).join(', ');
            const updateParams = params.filter((_, idx) => idx !== localIdIndex);
            updateParams.push(localId);
            alasql(escapeSqlKeywords(`UPDATE ${tableName} SET ${setClauses} WHERE local_id = ?`), updateParams);
            saveWebTable(tableName);
            return;
          }
        } else if (keyIndex !== -1) {
          const keyVal = params[keyIndex];
          const exists = alasql(escapeSqlKeywords(`SELECT 1 FROM ${tableName} WHERE key = ?`), [keyVal]) as unknown[];
          if (exists && exists.length > 0) {
            const setClauses = cols.filter(c => c !== 'key').map(c => `${c} = ?`).join(', ');
            const updateParams = params.filter((_, idx) => idx !== keyIndex);
            updateParams.push(keyVal);
            alasql(escapeSqlKeywords(`UPDATE ${tableName} SET ${setClauses} WHERE key = ?`), updateParams);
            saveWebTable(tableName);
            return;
          }
        }
      }
      cleanSql = cleanSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO');
    }

    // Translate INSERT OR IGNORE
    if (cleanSql.toUpperCase().includes('INSERT OR IGNORE INTO')) {
      const match = cleanSql.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1];
        const cols = match[2].split(',').map(c => c.trim());
        const localIdIndex = cols.indexOf('local_id');
        if (localIdIndex !== -1) {
          const localId = params[localIdIndex];
          const exists = alasql(escapeSqlKeywords(`SELECT 1 FROM ${tableName} WHERE local_id = ?`), [localId]) as unknown[];
          if (exists && exists.length > 0) {
            return;
          }
        }
      }
      cleanSql = cleanSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
    }

    try {
      alasql(escapeSqlKeywords(cleanSql), params);
      
      const tableName = getTableName(sql);
      if (tableName) {
        saveWebTable(tableName);
      }
    } catch (err) {
      log.error('alasql runSync error:', err, 'SQL:', sql, 'params:', params);
    }
  },

  getAllSync<T>(sql: string, params: unknown[] = []): T[] {
    try {
      return alasql(escapeSqlKeywords(sql), params) as T[];
    } catch (err) {
      log.error('alasql getAllSync error:', err, 'SQL:', sql, 'params:', params);
      return [];
    }
  },

  getFirstSync<T>(sql: string, params: unknown[] = []): T | null {
    try {
      const rows = alasql(escapeSqlKeywords(sql), params) as T[];
      return (rows[0] || null) as T | null;
    } catch (err) {
      log.error('alasql getFirstSync error:', err, 'SQL:', sql, 'params:', params);
      return null;
    }
  }
};

export const db: DatabaseConnection = Platform.OS === 'web'
  ? (webDbMock as unknown as DatabaseConnection)
  : (SQLite.openDatabaseSync('kutumbkosh.db') as unknown as DatabaseConnection);

export function initializeDB(): void {
  db.execSync(`PRAGMA journal_mode = WAL;`);
  db.execSync(`PRAGMA foreign_keys = ON;`);

  // Template for all tables — same structure repeated for each entity
  const createTable = (name: string, extraIndexCols = '', extraIndexCommands = '') => `
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
    ${extraIndexCommands}
  `;

  db.execSync(createTable('family_members'));
  db.execSync(createTable(
    'income_entries',
    'entry_date TEXT, member_idx TEXT,',
    'CREATE INDEX IF NOT EXISTS idx_income_sync_date ON income_entries(sync_status, entry_date); CREATE INDEX IF NOT EXISTS idx_income_date ON income_entries(entry_date);'
  ));
  db.execSync(createTable(
    'expense_entries',
    'entry_date TEXT, category_idx TEXT,',
    'CREATE INDEX IF NOT EXISTS idx_expense_sync_date ON expense_entries(sync_status, entry_date); CREATE INDEX IF NOT EXISTS idx_expense_date ON expense_entries(entry_date);'
  ));
  db.execSync(createTable('bank_accounts'));
  db.execSync(createTable(
    'lic_policies',
    'due_date TEXT,',
    'CREATE INDEX IF NOT EXISTS idx_lic_due ON lic_policies(due_date);'
  ));
  db.execSync(createTable(
    'insurance_policies',
    'renewal_date TEXT,',
    'CREATE INDEX IF NOT EXISTS idx_ins_ren ON insurance_policies(renewal_date);'
  ));
  db.execSync(createTable('loans'));
  db.execSync(createTable(
    'documents',
    'expiry_date TEXT,',
    'CREATE INDEX IF NOT EXISTS idx_doc_exp ON documents(expiry_date);'
  ));
  db.execSync(createTable(
    'fdrd_entries',
    'maturity_date TEXT,',
    'CREATE INDEX IF NOT EXISTS idx_fd_mat ON fdrd_entries(maturity_date);'
  ));
  db.execSync(createTable('property'));
  db.execSync(createTable('savings_goals'));
  db.execSync(createTable(
    'investments',
    'asset_type TEXT, ticker TEXT, quantity REAL, purchase_price REAL, current_price REAL,',
    'CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(asset_type);'
  ));

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

  // Seed default settings if empty
  try {
    const existing = db.getFirstSync('SELECT value FROM app_settings WHERE key = ?', ['monthly_budget_limit']) as { value: string } | null;
    if (!existing) {
      db.runSync('INSERT INTO app_settings (key, value) VALUES (?, ?)', ['monthly_budget_limit', '25000']);
    }
  } catch (err) {
    log.warn('Failed to seed default settings:', err);
  }
}

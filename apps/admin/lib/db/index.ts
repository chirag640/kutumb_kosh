import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';

const log = createLogger('db');
const env = getEnv();

const isLocalhost =
  env.DATABASE_URL.includes('localhost') ||
  env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  log.error('Unexpected database pool error', { error: err.message });
});

log.info('Database pool initialized', {
  host: isLocalhost ? 'localhost' : 'remote',
  maxConnections: 10,
});

export const db = drizzle(pool);

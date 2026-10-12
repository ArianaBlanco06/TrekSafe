import pg from 'pg';
import { loadEnv } from '../config/env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function buildConnectionString(url: string): string {
  const isTransactionPooler = /:6543(\/|\?|$)/.test(url);
  if (!isTransactionPooler || url.includes('pgbouncer=true')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}pgbouncer=true`;
}

/**
 * Pool PostgreSQL directo (opcional). Sprint 1 usa Supabase JS client (HTTPS).
 * Reservado para cron/SQL crudo en sprints posteriores.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const { databaseUrl } = loadEnv();
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL no configurada. El auth usa Supabase JS; DATABASE_URL solo para SQL directo.',
      );
    }
    pool = new Pool({
      connectionString: buildConnectionString(databaseUrl),
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

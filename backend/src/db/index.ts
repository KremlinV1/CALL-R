import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ DATABASE_URL not set, using mock mode');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

pool.on('error', (err) => {
  // Prevent the process from crashing on idle client errors
  console.error('Postgres pool error:', err);
});

export const db = drizzle(pool, { schema });
export { pool };

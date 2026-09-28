import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Suppress SSL warnings for Supabase compatibility
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Database connection pool configuration
// Support both Vercel Supabase variables and custom DB_* variables
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  console.error('❌ CRITICAL: No PostgreSQL connection string found.');
  console.error('❌ Set POSTGRES_URL, POSTGRES_URL_NON_POOLING, or POSTGRES_PRISMA_URL environment variable.');
  console.error('❌ The application cannot function without a database connection.');
  throw new Error('Database connection string is required. Set POSTGRES_URL environment variable.');
}

const pool = new pg.Pool({
  connectionString,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Run migrations on startup
async function runMigrations() {
  try {
    console.log('[Database] Starting migrations...');
    // Wait for database to be ready with retries
    let retries = 10;
    while (retries > 0) {
      try {
        await pool.query('SELECT 1');
        console.log('[Database] Database connection established');
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error('[Database] Failed to connect to database after retries:', error.message);
          throw error;
        }
        console.log(`[Database] Database not ready, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const migrationPath = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationPath)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[Database] Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationPath, file);
      const migrationSQL = fs.readFileSync(filePath, 'utf8');

      try {
        await pool.query(migrationSQL);
        console.log(`[Database] Migration ${file} executed successfully`);
      } catch (error) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists') && !error.message.includes('duplicate') && !error.message.includes('relation')) {
          console.error(`[Database] Migration ${file} failed:`, error.message);
          throw error;
        }
        console.log(`[Database] Migration ${file} skipped (already exists)`);
      }
    }
    console.log('[Database] All migrations completed successfully');
  } catch (error) {
    console.error('[Database] Migration error:', error);
    throw error;
  }
}

// Database query helper with error handling
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Database] Query executed', { text: text.substring(0, 50), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('[Database] Query error:', error.message);
    console.error('[Database] Failed query:', text.substring(0, 100));
    throw error;
  }
}

// Transaction helper
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Database connection status
let dbConnected = false;

// Health check
async function healthCheck() {
  try {
    await pool.query('SELECT 1');
    dbConnected = true;
    return { ok: true, database: 'connected' };
  } catch (error) {
    dbConnected = false;
    if (process.env.NODE_ENV !== 'production') {
      return { ok: true, database: 'disconnected', mode: 'development-mock' };
    }
    return { ok: false, database: 'disconnected', error: error.message };
  }
}

// Graceful shutdown
async function shutdown() {
  await pool.end();
  console.log('Database pool closed');
}

// Check if database is connected
function isDatabaseConnected() {
  return dbConnected;
}

export { pool, query, transaction, runMigrations, healthCheck, shutdown, isDatabaseConnected };
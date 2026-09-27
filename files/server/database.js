import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFallbackData, saveFallbackData } from './fallback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check if database is configured
const isDbConfigured = process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER;

// Database connection pool configuration
const pool = isDbConfigured ? new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'capitol',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}) : null;

// Run migrations on startup
async function runMigrations() {
  if (!pool) {
    console.log('Database not configured, skipping migrations');
    return;
  }

  try {
    // Check if database is accessible
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      console.log('Database not accessible, skipping migrations');
      return;
    }

    const migrationPath = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationPath)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationPath, file);
      const migrationSQL = fs.readFileSync(filePath, 'utf8');
      
      try {
        await pool.query(migrationSQL);
        console.log(`Migration ${file} executed successfully`);
      } catch (error) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
          console.error(`Migration ${file} failed:`, error.message);
          throw error;
        }
      }
    }
    console.log('All migrations completed');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Database query helper with error handling
async function query(text, params) {
  if (!pool) {
    console.log('Database not configured, using fallback storage');
    return { rows: [], rowCount: 0 };
  }

  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    // If database is not accessible, return empty result
    if (error.code === 'ECONNREFUSED') {
      console.log('Database not accessible, returning empty result');
      return { rows: [], rowCount: 0 };
    }
    throw error;
  }
}

// Transaction helper
async function transaction(callback) {
  if (!pool) {
    console.log('Database not configured, transaction failed');
    throw new Error('Database not configured');
  }

  try {
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
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('Database not accessible, transaction failed');
      throw error;
    }
    throw error;
  }
}

// Health check
async function healthCheck() {
  if (!pool) {
    return { ok: true, database: 'not_configured' };
  }
  try {
    await pool.query('SELECT 1');
    return { ok: true, database: 'connected' };
  } catch (error) {
    return { ok: false, database: 'disconnected', error: error.message };
  }
}

// Graceful shutdown
async function shutdown() {
  if (pool) {
    await pool.end();
    console.log('Database pool closed');
  }
}

export { pool, query, transaction, runMigrations, healthCheck, shutdown };
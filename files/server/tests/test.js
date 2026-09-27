/**
 * Capitol Backend Tests
 * Tests for critical flows using the new PostgreSQL backend
 */

import pg from 'pg';

// Test database connection
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'capitol_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// Test utilities
async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

function uid() {
  return 'test_' + Math.random().toString(36).substring(2, 10);
}

// Tests
const tests = {
  async 'Database connection'() {
    try {
      await query('SELECT 1');
      console.log('✓ Database connection successful');
      return true;
    } catch (error) {
      console.error('✗ Database connection failed:', error.message);
      return false;
    }
  },

  async 'User signup'() {
    try {
      const testUser = {
        id: uid(),
        username: 'testuser_' + Math.random().toString(36).substring(2, 8),
        email: `test${Math.random()}@example.com`,
        display_name: 'Test User',
        password_hash: 'test_hash',
        created_at: new Date().toISOString(),
      };

      await query(
        `INSERT INTO users (id, username, email, display_name, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testUser.id, testUser.username, testUser.email, testUser.display_name, testUser.password_hash, testUser.created_at]
      );

      const result = await query('SELECT * FROM users WHERE id = $1', [testUser.id]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found after insert');
      }

      // Cleanup
      await query('DELETE FROM users WHERE id = $1', [testUser.id]);
      
      console.log('✓ User signup successful');
      return true;
    } catch (error) {
      console.error('✗ User signup failed:', error.message);
      return false;
    }
  },

  async 'Room creation'() {
    try {
      const testRoom = {
        id: uid(),
        name: 'Test Room',
        niche: 'coding',
        max_members: 8,
        created_at: new Date().toISOString(),
        creator_uid: 'test_user',
      };

      await query(
        `INSERT INTO rooms (id, name, niche, max_members, created_at, creator_uid, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [testRoom.id, testRoom.name, testRoom.niche, testRoom.max_members, testRoom.created_at, testRoom.creator_uid]
      );

      const result = await query('SELECT * FROM rooms WHERE id = $1', [testRoom.id]);
      
      if (result.rows.length === 0) {
        throw new Error('Room not found after insert');
      }

      // Cleanup
      await query('DELETE FROM rooms WHERE id = $1', [testRoom.id]);
      
      console.log('✓ Room creation successful');
      return true;
    } catch (error) {
      console.error('✗ Room creation failed:', error.message);
      return false;
    }
  },

  async 'Room membership'() {
    try {
      const roomId = uid();
      const userId = uid();

      // Create test room
      await query(
        `INSERT INTO rooms (id, name, niche, max_members, created_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [roomId, 'Test Room', 'general', 8, new Date().toISOString()]
      );

      // Create test user
      await query(
        `INSERT INTO users (id, username, email, display_name, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, 'testuser', 'test@example.com', 'Test User', 'hash', new Date().toISOString()]
      );

      // Add member
      const memberId = uid();
      await query(
        `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
         VALUES ($1, $2, $3, 'active', $4)`,
        [memberId, roomId, userId, new Date().toISOString()]
      );

      // Verify membership
      const result = await query(
        `SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2 AND status = 'active'`,
        [roomId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Membership not found');
      }

      // Cleanup
      await query('DELETE FROM room_members WHERE id = $1', [memberId]);
      await query('DELETE FROM rooms WHERE id = $1', [roomId]);
      await query('DELETE FROM users WHERE id = $1', [userId]);
      
      console.log('✓ Room membership successful');
      return true;
    } catch (error) {
      console.error('✗ Room membership failed:', error.message);
      return false;
    }
  },

  async 'XP update'() {
    try {
      const userId = uid();

      // Create test user
      await query(
        `INSERT INTO users (id, username, email, display_name, password_hash, xp, level, created_at)
         VALUES ($1, $2, $3, $4, $5, 0, 1, $6)`,
        [userId, 'testuser', 'test@example.com', 'Test User', 'hash', new Date().toISOString()]
      );

      // Update XP
      await query('UPDATE users SET xp = xp + 50, level = 2 WHERE id = $1', [userId]);

      // Verify
      const result = await query('SELECT xp, level FROM users WHERE id = $1', [userId]);
      
      if (result.rows[0].xp !== 50 || result.rows[0].level !== 2) {
        throw new Error('XP update did not persist correctly');
      }

      // Cleanup
      await query('DELETE FROM users WHERE id = $1', [userId]);
      
      console.log('✓ XP update successful');
      return true;
    } catch (error) {
      console.error('✗ XP update failed:', error.message);
      return false;
    }
  },

  async 'Proof submission'() {
    try {
      const userId = uid();
      const today = new Date().toISOString().slice(0, 10);

      // Create test user
      await query(
        `INSERT INTO users (id, username, email, display_name, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, 'testuser', 'test@example.com', 'Test User', 'hash', new Date().toISOString()]
      );

      // Submit proof
      const proofId = uid();
      await query(
        `INSERT INTO proofs (id, user_id, date_key, created_at, streak, xp_earned, ai_verdict)
         VALUES ($1, $2, $3, $4, 1, 10, 'approved')`,
        [proofId, userId, today, new Date().toISOString()]
      );

      // Verify
      const result = await query('SELECT * FROM proofs WHERE id = $1', [proofId]);
      
      if (result.rows.length === 0) {
        throw new Error('Proof not found after insert');
      }

      // Cleanup
      await query('DELETE FROM proofs WHERE id = $1', [proofId]);
      await query('DELETE FROM users WHERE id = $1', [userId]);
      
      console.log('✓ Proof submission successful');
      return true;
    } catch (error) {
      console.error('✗ Proof submission failed:', error.message);
      return false;
    }
  },

  async 'Transaction rollback'() {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Insert test data
        const testId = uid();
        await client.query(
          `INSERT INTO users (id, username, email, display_name, password_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [testId, 'testuser', 'test@example.com', 'Test User', 'hash', new Date().toISOString()]
        );

        // Rollback
        await client.query('ROLLBACK');

        // Verify rollback worked
        const result = await client.query('SELECT * FROM users WHERE id = $1', [testId]);
        
        if (result.rows.length > 0) {
          throw new Error('Transaction rollback failed - data still exists');
        }

        console.log('✓ Transaction rollback successful');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('✗ Transaction rollback failed:', error.message);
      return false;
    }
  },
};

// Run tests
async function runTests() {
  console.log('Running Capitol Backend Tests...\n');

  let passed = 0;
  let failed = 0;

  for (const [name, test] of Object.entries(tests)) {
    console.log(`Testing: ${name}`);
    const result = await test();
    if (result) {
      passed++;
    } else {
      failed++;
    }
    console.log();
  }

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { tests, runTests };
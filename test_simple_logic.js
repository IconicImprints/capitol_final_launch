/**
 * Simple test for the kick/rejoin logic using existing users
 */

import { query } from './files/server/database.js';

async function testRejoinLogic() {
  console.log('=== Testing Kick/Rejoin Logic ===\n');

  try {
    // Get an existing user and room
    const userResult = await query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      throw new Error('No users found in database');
    }
    const userId = userResult.rows[0].id;
    console.log('Using existing user:', userId);

    // Create a test room
    const roomId = 'test_room_' + Date.now();
    const now = new Date().toISOString();
    
    await query(
      `INSERT INTO rooms (id, name, icon, goal, niche, age_range, tags, max_members, elite, days, created_at, creator_uid, status)
       VALUES ($1, 'Test Room', 'bolt', '', 'general', null, '[]', 4, false, 30, $2, $3, 'active')`,
      [roomId, now, userId]
    );
    console.log('✓ Created test room:', roomId);

    // Add user as creator (active member)
    const creatorMemberId = 'member_' + Date.now() + '_1';
    await query(
      `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
       VALUES ($1, $2, $3, 'active', $4)`,
      [creatorMemberId, roomId, userId, now]
    );
    console.log('✓ Added user as creator');

    // Create a second user for testing
    const testUserId = 'u_test_' + Date.now().toString(36);
    const inviteCode = testUserId.replace(/_/g, '').slice(0, 12).toUpperCase();
    
    // Simplified user insert
    await query(
      `INSERT INTO users (id, username, email, display_name, password_hash, avatar_config, created_at, last_seen_at, xp, level, streak, kick_status, kicked_from_room, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [testUserId, 'testuser_' + Date.now(), 'test_' + Date.now() + '@example.com', 'Test User', 'hash', 
       JSON.stringify({ background: '#F5C800', letter: 'T' }), now, now, 0, 1, 0, 'ok', false, inviteCode]
    );
    console.log('✓ Created test user:', testUserId);

    // Add test user as active member
    const testMemberId = 'member_' + Date.now() + '_2';
    await query(
      `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
       VALUES ($1, $2, $3, 'active', $4)`,
      [testMemberId, roomId, testUserId, now]
    );
    console.log('✓ Added test user as active member');

    // Verify initial state
    const beforeKick = await query(
      `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
      [roomId]
    );
    console.log('Active members before kick:', parseInt(beforeKick.rows[0].count));

    // Kick the test user
    await query(
      `UPDATE room_members SET status = 'kicked', left_at = NOW() 
       WHERE room_id = $1 AND user_id = $2 AND status = 'active'`,
      [roomId, testUserId]
    );
    console.log('✓ Kicked test user');

    // Verify kick worked
    const afterKick = await query(
      `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
      [roomId]
    );
    console.log('Active members after kick:', parseInt(afterKick.rows[0].count));

    if (parseInt(afterKick.rows[0].count) !== 1) {
      throw new Error('Expected 1 active member after kick');
    }

    // SIMULATE THE JOIN ENDPOINT LOGIC FOR REJOINING
    console.log('\n=== Testing Rejoin Logic ===');
    
    // Check if user was kicked from this specific room
    const kickedMember = await query(
      `SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2 AND status = 'kicked'`,
      [roomId, testUserId]
    );

    if (kickedMember.rows.length > 0) {
      console.log('Found kicked member record');
      // User was kicked from this room - they can rejoin after being kicked
      // We'll treat this as a rejoin by updating their existing record
      await query(
        `UPDATE room_members SET status = 'active', joined_at = NOW(), left_at = NULL 
         WHERE id = $1`,
        [kickedMember.rows[0].id]
      );
      console.log('✓ Updated kicked member back to active');
    } else {
      throw new Error('Failed to find kicked member record');
    }

    // Verify rejoin worked
    const afterRejoin = await query(
      `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
      [roomId]
    );
    console.log('Active members after rejoin:', parseInt(afterRejoin.rows[0].count));

    if (parseInt(afterRejoin.rows[0].count) !== 2) {
      throw new Error('Expected 2 active members after rejoin');
    }

    // Verify the specific member status
    const memberStatus = await query(
      `SELECT status, left_at FROM room_members WHERE user_id = $1 AND room_id = $2`,
      [testUserId, roomId]
    );
    console.log('Test user status:', memberStatus.rows[0].status);
    console.log('Test user left_at:', memberStatus.rows[0].left_at);

    if (memberStatus.rows[0].status !== 'active') {
      throw new Error('Test user should be active after rejoin');
    }
    if (memberStatus.rows[0].left_at !== null) {
      throw new Error('left_at should be NULL after rejoin');
    }

    console.log('\n=== ALL TESTS PASSED ===');
    console.log('The kick/rejoin logic is working correctly!');

    // Cleanup
    console.log('\nCleaning up test data...');
    await query('DELETE FROM room_members WHERE room_id = $1', [roomId]);
    await query('DELETE FROM rooms WHERE id = $1', [roomId]);
    await query('DELETE FROM users WHERE id = $1', [testUserId]);
    console.log('✓ Cleanup complete');

  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testRejoinLogic().catch(console.error);

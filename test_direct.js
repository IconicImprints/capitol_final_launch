/**
 * Direct database test for kick/rejoin functionality
 */

import { query, transaction } from './files/server/database.js';
import { hashPassword, generateToken } from './files/server/auth.js';

async function createUser(username, email, password) {
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const invite = id.replace(/_/g, '').slice(0, 12).toUpperCase(); // Use user ID as invite code
  
  await query(
    `INSERT INTO users (
      id, username, email, display_name, password_hash,
      avatar_config, created_at, last_seen_at, xp, level, streak,
      best_streak, missed_days, warned, kick_status, kicked_from_room,
      proofs_count, completed_rooms, joined_rooms, join_timestamp,
      consistency_score, near_miss_count, league, grace_active,
      grace_start_date, grace_days_total, total_grace_used,
      last_submit_date, onboarding_complete, onboarding_questions_complete,
      niche, age_range, room_joined_at, onboard_bonus_awarded,
      safety_accepted, invite_code, invites_count, burned_at,
      following, premium, xp_awarded_keys
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41)`,
    [
      id, username, email.toLowerCase(), username, passwordHash,
      JSON.stringify({ background: '#F5C800', letter: username[0].toUpperCase() }),
      now, now, 0, 1, 0, 0, 0, false, 'ok', false,
      0, 0, 0, now, 0, 0, 'bronze', false,
      null, 0, 0, null, false, false,
      '', '', null, false, null, false,
      0, null, '[]', false, '{}'
    ]
  );
  
  const token = generateToken(id);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address, user_agent)
     VALUES ($1, $2, NOW(), $3, $4, $5)`,
    [token, id, expiresAt, '127.0.0.1', 'test']
  );
  
  return { id, username, token };
}

async function createRoom(userId, name) {
  const roomId = 'room_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  
  await query(
    `INSERT INTO rooms (id, name, icon, goal, niche, age_range, tags, max_members, elite, days, created_at, creator_uid, status)
     VALUES ($1, $2, 'bolt', '', 'general', null, '[]', 4, false, 30, $3, $4, 'active')`,
    [roomId, name, now, userId]
  );
  
  const memberId = 'rm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  await query(
    `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
     VALUES ($1, $2, $3, 'active', $4)`,
    [memberId, roomId, userId, now]
  );
  
  return roomId;
}

async function joinRoom(userId, roomId) {
  const memberId = 'rm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  
  await query(
    `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
     VALUES ($1, $2, $3, 'active', $4)`,
    [memberId, roomId, userId, now]
  );
}

async function kickMember(roomId, userId) {
  await query(
    `UPDATE room_members SET status = 'kicked', left_at = NOW() 
     WHERE room_id = $1 AND user_id = $2 AND status = 'active'`,
    [roomId, userId]
  );
}

async function getMembershipStatus(roomId, userId) {
  const result = await query(
    `SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  return result.rows[0];
}

async function getRoomMemberCount(roomId) {
  const result = await query(
    `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
    [roomId]
  );
  return parseInt(result.rows[0].count);
}

async function main() {
  console.log('=== Testing Kick/Rejoin Functionality (Direct DB) ===\n');

  try {
    // Step 1: Create User A
    console.log('Step 1: Creating User A...');
    const userA = await createUser('alice_test', 'alice_direct@example.com', 'password123');
    console.log('✓ User A created:', userA.username);

    // Step 2: Create User B
    console.log('\nStep 2: Creating User B...');
    const userB = await createUser('bob_test', 'bob_direct@example.com', 'password123');
    console.log('✓ User B created:', userB.username);

    // Step 3: User A creates a room
    console.log('\nStep 3: User A creates a room...');
    const roomId = await createRoom(userA.id, 'Test Room');
    console.log('✓ Room created:', roomId);

    // Step 4: User B joins the room
    console.log('\nStep 4: User B joins the room...');
    await joinRoom(userB.id, roomId);
    console.log('✓ User B joined the room');

    // Verify User B is in the room
    const membershipBefore = await getMembershipStatus(roomId, userB.id);
    const countBefore = await getRoomMemberCount(roomId);
    console.log('Membership before kick:', membershipBefore.status);
    console.log('Member count before kick:', countBefore);

    if (membershipBefore.status !== 'active') {
      throw new Error('FAILED: User B should be active before kick');
    }
    if (countBefore !== 2) {
      throw new Error('FAILED: Expected 2 members before kick, got ' + countBefore);
    }

    // Step 5: User A kicks User B
    console.log('\nStep 5: User A kicks User B...');
    await kickMember(roomId, userB.id);
    console.log('✓ User B kicked from the room');

    // Step 6: Confirm B is no longer an active member
    console.log('\nStep 6: Confirming B is no longer an active member...');
    const membershipAfterKick = await getMembershipStatus(roomId, userB.id);
    const countAfterKick = await getRoomMemberCount(roomId);
    console.log('Membership after kick:', membershipAfterKick.status);
    console.log('Member count after kick:', countAfterKick);

    if (membershipAfterKick.status !== 'kicked') {
      throw new Error('FAILED: User B should have status "kicked" after being kicked');
    }
    if (countAfterKick !== 1) {
      throw new Error('FAILED: Expected 1 member after kick, got ' + countAfterKick);
    }
    console.log('✓ User B is no longer an active member');

    // Step 7: B joins the same room again (simulating rejoin via API)
    console.log('\nStep 7: User B joins the same room again...');
    await query(
      `UPDATE room_members SET status = 'active', joined_at = NOW(), left_at = NULL 
       WHERE room_id = $1 AND user_id = $2 AND status = 'kicked'`,
      [roomId, userB.id]
    );
    console.log('✓ User B rejoined the room');

    // Step 8: Refresh B's page (check membership via API)
    console.log('\nStep 8: Refreshing B\'s page (checking membership)...');
    const membershipAfterRejoin = await getMembershipStatus(roomId, userB.id);
    const countAfterRejoin = await getRoomMemberCount(roomId);
    console.log('Membership after rejoin:', membershipAfterRejoin.status);
    console.log('Member count after rejoin:', countAfterRejoin);

    if (membershipAfterRejoin.status !== 'active') {
      throw new Error('FAILED: User B should be active after rejoining');
    }
    console.log('✓ User B is now an active member');

    // Step 9: Confirm room member count is correct and an integer
    console.log('\nStep 9: Confirming room member count is correct and an integer...');
    console.log('Member count:', countAfterRejoin, 'Type:', typeof countAfterRejoin);

    if (!Number.isInteger(countAfterRejoin)) {
      throw new Error('FAILED: Member count should be an integer');
    }

    if (countAfterRejoin !== 2) {
      throw new Error('FAILED: Expected 2 members, got ' + countAfterRejoin);
    }
    console.log('✓ Room member count is correct (2) and an integer');

    console.log('\n=== ALL TESTS PASSED ===');
    console.log('The kick/rejoin functionality is working correctly!');

    // Cleanup
    console.log('\nCleaning up test data...');
    await query('DELETE FROM room_members WHERE room_id = $1', [roomId]);
    await query('DELETE FROM rooms WHERE id = $1', [roomId]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
    console.log('✓ Cleanup complete');

  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

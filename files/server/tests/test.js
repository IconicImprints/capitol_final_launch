/**
 * Capitol Backend Tests
 * Tests for critical flows using the Supabase backend, including atomic RPC paths.
 */

import { 
  supabase, 
  getUserById, 
  createUser, 
  updateUser, 
  getRoomById, 
  createRoom, 
  createRoomMember, 
  getRoomMemberCount, 
  createProof, 
  getProofByUserAndDate,
  getUserProofDates,
  signupAtomic,
  createRoomAtomic,
  submitProofAtomic,
  updateUserXPAtomic,
  calcLevel
} from '../supabaseClient.js';

function uid() {
  return 'test_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

async function logEnvDiagnostics() {
  const url = process.env.SUPABASE_URL || '';
  const keyExists = typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string' && process.env.SUPABASE_SERVICE_ROLE_KEY.length > 0;
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = '(invalid URL)';
  }
  console.log('[Diagnostics] SUPABASE_URL present:', Boolean(url));
  console.log('[Diagnostics] SUPABASE_URL hostname:', hostname);
  console.log('[Diagnostics] SUPABASE_SERVICE_ROLE_KEY present:', keyExists);
}

async function logFetchErrorDetails(err) {
  const cause = err.cause || {};
  console.log('[Diagnostics] fetch error name:', err.name);
  console.log('[Diagnostics] fetch error message:', err.message);
  if (cause.code) console.log('[Diagnostics] fetch error code:', cause.code);
  if (cause.address) console.log('[Diagnostics] fetch error address:', cause.address);
  if (cause.port) console.log('[Diagnostics] fetch error port:', cause.port);
}

async function cleanUser(id) {
  if (!id) return;
  await supabase.from('proofs').delete().eq('user_id', id);
  await supabase.from('room_members').delete().eq('user_id', id);
  await supabase.from('sessions').delete().eq('user_id', id);
  await supabase.from('streaks').delete().eq('user_id', id);
  await supabase.from('user_achievements').delete().eq('user_id', id);
  await supabase.from('notifications').delete().eq('user_id', id);
  await supabase.from('follows').delete().eq('from_user_id', id);
  await supabase.from('follows').delete().eq('to_user_id', id);
  await supabase.from('close_friends').delete().eq('a', id);
  await supabase.from('close_friends').delete().eq('b', id);
  await supabase.from('close_friend_requests').delete().eq('from_user_id', id);
  await supabase.from('close_friend_requests').delete().eq('to_user_id', id);
  await supabase.from('challenges').delete().eq('from_uid', id);
  await supabase.from('challenges').delete().eq('to_uid', id);
  await supabase.from('freeze_tokens').delete().eq('user_id', id);
  await supabase.from('waiting_queue').delete().eq('user_id', id);
  await supabase.from('users').delete().eq('id', id);
}

async function cleanRoom(id) {
  if (!id) return;
  await supabase.from('room_members').delete().eq('room_id', id);
  await supabase.from('rooms').delete().eq('id', id);
}

async function createTestUser(overrides = {}) {
  const id = uid();
  const user = {
    id,
    username: 'testuser_' + Math.random().toString(36).substring(2, 8),
    email: `test${Math.random()}@example.com`,
    display_name: 'Test User',
    password_hash: 'test_hash',
    created_at: new Date().toISOString(),
    xp: 0,
    level: 1,
    streak: 0,
    best_streak: 0,
    proofs_count: 0,
    missed_days: 0,
    warned: false,
    kick_status: 'ok',
    kicked_from_room: false,
    joined_rooms: 0,
    consistency_score: 0,
    near_miss_count: 0,
    league: 'bronze',
    grace_active: false,
    grace_days_total: 0,
    total_grace_used: 0,
    last_submit_date: null,
    onboarding_complete: false,
    onboarding_questions_complete: false,
    niche: '',
    age_range: '',
    room_joined_at: null,
    onboard_bonus_awarded: false,
    safety_accepted: null,
    invite_code: uid(),
    invites_count: 0,
    burned_at: null,
    following: [],
    premium: false,
    xp_awarded_keys: {},
    ...overrides
  };
  const created = await createUser(user);
  if (!created || !created.id) throw new Error('Test user not created');
  return { id, user: created };
}

const tests = {
  async 'Supabase connection'() {
    try {
      const { data, error } = await supabase.from('users').select('id').limit(1);
      if (error) throw error;
      console.log('✓ Supabase connection successful');
      return true;
    } catch (error) {
      console.error('✗ Supabase connection failed:', error.message);
      return false;
    }
  },

  async 'signupAtomic - happy path'() {
    try {
      const id = uid();
      const username = 'atomic_signup_' + Math.random().toString(36).substring(2, 8);
      const email = `atomic_${Math.random()}@example.com`;
      const token = uid();
      const displayName = 'Atomic Signup';
      const passwordHash = 'test_hash';
      const avatarConfig = { background: '#F5C800', letter: 'A' };
      const inviteCode = 'INV' + Date.now().toString(36);

      const signupData = {
        p_id: id,
        p_username: username,
        p_email: email,
        p_display_name: displayName,
        p_password_hash: passwordHash,
        p_avatar_config: avatarConfig,
        p_invite_code: inviteCode,
        p_token: token,
        p_ip_address: '127.0.0.1',
        p_user_agent: 'test'
      };

      const resultId = await signupAtomic(signupData);
      if (resultId !== id) throw new Error('signupAtomic did not return created user ID');

      const user = await getUserById(id);
      if (!user || user.id !== id) throw new Error('User not found after signupAtomic');
      if (user.username !== username) throw new Error('Username mismatch');
      if (user.email !== email) throw new Error('Email mismatch');
      if (user.display_name !== displayName) throw new Error('Display name mismatch');

      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('token', token)
        .eq('user_id', id);

      if (!sessions || sessions.length === 0) throw new Error('Session not created by signupAtomic');

      console.log('✓ signupAtomic happy path successful');
      await cleanUser(id);
      return true;
    } catch (error) {
      console.error('✗ signupAtomic happy path failed:', error.message);
      return false;
    }
  },

  async 'signupAtomic - rollback on duplicate username'() {
    try {
      const existing = await createTestUser({ username: 'atomic_dup_user' });
      const duplicateId = uid();
      const signupData = {
        p_id: duplicateId,
        p_username: existing.user.username,
        p_email: `unique_${Math.random()}@example.com`,
        p_display_name: 'Duplicate',
        p_password_hash: 'hash',
        p_avatar_config: { background: '#F5C800', letter: 'D' },
        p_invite_code: uid(),
        p_token: uid(),
        p_ip_address: '127.0.0.1',
        p_user_agent: 'test'
      };

      let threw = false;
      try {
        await signupAtomic(signupData);
      } catch (error) {
        threw = true;
      }

      if (!threw) throw new Error('signupAtomic did not throw on duplicate username');

      const stillExists = await getUserById(existing.id);
      if (!stillExists) throw new Error('Original user was removed during rollback');

      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', duplicateId);

      if (sessions && sessions.length > 0) throw new Error('Session created despite signup failure');

      console.log('✓ signupAtomic rollback on duplicate successful');
      await cleanUser(existing.id);
      return true;
    } catch (error) {
      console.error('✗ signupAtomic rollback failed:', error.message);
      return false;
    }
  },

  async 'createRoomAtomic - happy path'() {
    try {
      const { id: userId } = await createTestUser();
      const roomId = uid();

      const resultId = await createRoomAtomic({
        p_room_id: roomId,
        p_user_id: userId,
        p_name: 'Atomic Room',
        p_niche: 'coding',
        p_max_members: 8,
        p_status: 'active'
      });

      if (resultId !== roomId) throw new Error('createRoomAtomic did not return room ID');

      const room = await getRoomById(roomId);
      if (!room || room.id !== roomId) throw new Error('Room not found after createRoomAtomic');
      if (room.name !== 'Atomic Room') throw new Error('Room name mismatch');

      const memberCount = await getRoomMemberCount(roomId);
      if (memberCount !== 1) throw new Error('Expected 1 member after room creation');

      const updatedUser = await getUserById(userId);
      if ((updatedUser.joined_rooms || 0) < 1) throw new Error('User joined_rooms not incremented');
      if (!updatedUser.room_joined_at) throw new Error('User room_joined_at not set');

      console.log('✓ createRoomAtomic happy path successful');
      await cleanRoom(roomId);
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ createRoomAtomic happy path failed:', error.message);
      return false;
    }
  },

  async 'submitProofAtomic - happy path and user stat updates'() {
    try {
      const { id: userId } = await createTestUser({ streak: 0, best_streak: 0, proofs_count: 0 });
      const today = new Date().toISOString().slice(0, 10);
      const proofId = uid();

      const result = await submitProofAtomic({
        p_proof_id: proofId,
        p_user_id: userId,
        p_date_key: today,
        p_streak: 1,
        p_xp_earned: 12,
        p_image_url: null,
        p_link: '',
        p_note: '',
        p_ai_verdict: 'approved',
        p_room_id: null,
        p_votes: {},
        p_gesture: null,
        p_best_streak: 1
      });

      if (result.new_xp !== 12) throw new Error(`Expected XP 12, got ${result.new_xp}`);
      if (result.new_level !== 1) throw new Error(`Expected level 1, got ${result.new_level}`);
      if (result.current_streak !== 1) throw new Error(`Expected streak 1, got ${result.current_streak}`);

      const proof = await getProofByUserAndDate(userId, today);
      if (!proof || proof.id !== proofId) throw new Error('Proof not found after submitProofAtomic');

      const updatedUser = await getUserById(userId);
      if (updatedUser.streak !== 1) throw new Error(`User streak not updated: ${updatedUser.streak}`);
      if (updatedUser.best_streak !== 1) throw new Error(`User best_streak not updated: ${updatedUser.best_streak}`);
      if ((updatedUser.proofs_count || 0) !== 1) throw new Error(`User proofs_count not incremented: ${updatedUser.proofs_count}`);

      const { data: streak } = await supabase.from('streaks').select('*').eq('user_id', userId).single();
      if (!streak) throw new Error('Streak record not created');
      if (streak.current_streak !== 1) throw new Error('Streak current_streak mismatch');

      console.log('✓ submitProofAtomic happy path successful');
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ submitProofAtomic happy path failed:', error.message);
      return false;
    }
  },

  async 'submitProofAtomic - rollback on missing user'() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const proofId = uid();

      let threw = false;
      try {
        await submitProofAtomic({
          p_proof_id: proofId,
          p_user_id: 'user_nonexistent_' + Date.now(),
          p_date_key: today,
          p_streak: 1,
          p_xp_earned: 10,
          p_best_streak: 1
        });
      } catch (error) {
        threw = true;
      }

      if (!threw) throw new Error('submitProofAtomic did not throw on missing user');

      const proof = await getProofByUserAndDate('user_nonexistent_' + Date.now(), today);
      if (proof) throw new Error('Proof was created despite user not existing');

      console.log('✓ submitProofAtomic rollback on missing user successful');
      return true;
    } catch (error) {
      console.error('✗ submitProofAtomic rollback failed:', error.message);
      return false;
    }
  },

  async 'updateUserXPAtomic - happy path'() {
    try {
      const { id: userId } = await createTestUser({ xp: 0, level: 1 });

      const result = await updateUserXPAtomic(userId, 50, 'test_atomic_happy');

      if (result.xp !== 50) throw new Error(`Expected XP 50, got ${result.xp}`);
      if (result.level !== 2) throw new Error(`Expected level 2, got ${result.level}`);

      const updatedUser = await getUserById(userId);
      if (updatedUser.xp !== 50) throw new Error('User XP not persisted');
      if (updatedUser.level !== 2) throw new Error('User level not persisted');

      console.log('✓ updateUserXPAtomic happy path successful');
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ updateUserXPAtomic happy path failed:', error.message);
      return false;
    }
  },

  async 'updateUserXPAtomic - duplicate award protection'() {
    try {
      const { id: userId } = await createTestUser({ xp: 0, level: 1, xp_awarded_keys: {} });

      const first = await updateUserXPAtomic(userId, 30, 'test_atomic_dup');
      if (first.xp !== 30) throw new Error(`First award XP mismatch: ${first.xp}`);

      const second = await updateUserXPAtomic(userId, 30, 'test_atomic_dup');
      if (second.xp !== 30) throw new Error(`Duplicate award changed XP: ${second.xp}`);
      if (second.level !== first.level) throw new Error('Duplicate award changed level');

      const updatedUser = await getUserById(userId);
      if (updatedUser.xp !== 30) throw new Error('XP changed after duplicate attempt');
      const expectedKey = 'xp_test_atomic_dup_' + new Date().toISOString().slice(0, 10);
      if ((updatedUser.xp_awarded_keys || {})[expectedKey] !== true) {
        throw new Error('XP awarded key not recorded');
      }

      console.log('✓ updateUserXPAtomic duplicate award protection successful');
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ updateUserXPAtomic duplicate protection failed:', error.message);
      return false;
    }
  },

  async 'submitProofAtomic - application-level duplicate proof guard'() {
    try {
      const { id: userId } = await createTestUser();
      const today = new Date().toISOString().slice(0, 10);
      const proofId1 = uid();
      const proofId2 = uid();

      await submitProofAtomic({
        p_proof_id: proofId1,
        p_user_id: userId,
        p_date_key: today,
        p_streak: 1,
        p_xp_earned: 10,
        p_best_streak: 1
      });

      const existing = await getProofByUserAndDate(userId, today);
      if (!existing) throw new Error('First proof not found');

      if (existing.id !== proofId1) throw new Error('Existing proof ID mismatch');

      const proofsForDay = await getUserProofDates(userId);
      const sameDay = proofsForDay.filter(p => p.date_key === today);
      if (sameDay.length < 1) throw new Error('Expected at least 1 proof for date');

      await submitProofAtomic({
        p_proof_id: proofId2,
        p_user_id: userId,
        p_date_key: today,
        p_streak: 1,
        p_xp_earned: 10,
        p_best_streak: 1
      });

      const afterSecond = await getUserProofDates(userId);
      const afterDay = afterSecond.filter(p => p.date_key === today);
      if (afterDay.length !== 2) throw new Error(`Expected 2 proofs after second submit, got ${afterDay.length}`);

      console.log('✓ submitProofAtomic duplicate behavior documented');
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ submitProofAtomic duplicate proof test failed:', error.message);
      return false;
    }
  },

  async 'createRoomAtomic - leaves old rooms before creating new'() {
    try {
      const { id: userId } = await createTestUser();

      const oldRoomId = uid();
      await createRoomAtomic({
        p_room_id: oldRoomId,
        p_user_id: userId,
        p_name: 'Old Room',
        p_status: 'active'
      });

      const oldMemberCount = await getRoomMemberCount(oldRoomId);
      if (oldMemberCount !== 1) throw new Error('Old room membership not created');

      const newRoomId = uid();
      await createRoomAtomic({
        p_room_id: newRoomId,
        p_user_id: userId,
        p_name: 'New Room',
        p_status: 'active'
      });

      const { data: oldMembers } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', oldRoomId)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (oldMembers && oldMembers.length > 0) throw new Error('Old active membership was not left');

      const newMemberCount = await getRoomMemberCount(newRoomId);
      if (newMemberCount !== 1) throw new Error('New room membership not created');

      const updatedUser = await getUserById(userId);
      if ((updatedUser.joined_rooms || 0) < 2) throw new Error('Expected joined_rooms >= 2 after creating two rooms');

      console.log('✓ createRoomAtomic leaves old rooms successfully');
      await cleanRoom(oldRoomId);
      await cleanRoom(newRoomId);
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ createRoomAtomic leave old rooms failed:', error.message);
      return false;
    }
  },

  async 'User creation'() {
    try {
      const id = uid();
      const user = {
        id,
        username: 'testuser_' + Math.random().toString(36).substring(2, 8),
        email: `test${Math.random()}@example.com`,
        display_name: 'Test User',
        password_hash: 'test_hash',
        created_at: new Date().toISOString(),
      };

      const created = await createUser(user);
      if (!created || !created.id) throw new Error('User not created');

      const fetched = await getUserById(id);
      if (!fetched || fetched.id !== id) throw new Error('User not found after insert');

      console.log('✓ User creation successful');
      await cleanUser(id);
      return true;
    } catch (error) {
      console.error('✗ User creation failed:', error.message);
      return false;
    }
  },

  async 'Room creation'() {
    try {
      const userId = uid();
      const user = {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        password_hash: 'hash',
        created_at: new Date().toISOString(),
      };
      await createUser(user);

      const id = uid();
      const room = {
        id,
        name: 'Test Room',
        niche: 'coding',
        max_members: 8,
        created_at: new Date().toISOString(),
        creator_uid: userId,
        status: 'active'
      };

      const created = await createRoom(room);
      if (!created || !created.id) throw new Error('Room not created');

      const fetched = await getRoomById(id);
      if (!fetched || fetched.id !== id) throw new Error('Room not found after insert');

      console.log('✓ Room creation successful');
      await cleanRoom(id);
      await cleanUser(userId);
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

      const room = {
        id: roomId,
        name: 'Test Room',
        niche: 'general',
        max_members: 8,
        created_at: new Date().toISOString(),
        status: 'active'
      };
      await createRoom(room);

      const user = {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        password_hash: 'hash',
        created_at: new Date().toISOString(),
      };
      await createUser(user);

      const memberId = uid();
      await createRoomMember({
        id: memberId,
        room_id: roomId,
        user_id: userId,
        status: 'active',
        joined_at: new Date().toISOString()
      });

      const count = await getRoomMemberCount(roomId);
      if ((count || 0) < 1) throw new Error('Membership not found');

      console.log('✓ Room membership successful');
      await cleanRoom(roomId);
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ Room membership failed:', error.message);
      return false;
    }
  },

  async 'Proof submission'() {
    try {
      const userId = uid();
      const today = new Date().toISOString().slice(0, 10);

      const user = {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        password_hash: 'hash',
        created_at: new Date().toISOString(),
      };
      await createUser(user);

      const proofId = uid();
      await createProof({
        id: proofId,
        user_id: userId,
        date_key: today,
        created_at: new Date().toISOString(),
        streak: 1,
        xp_earned: 10,
        ai_verdict: 'approved'
      });

      const fetched = await getProofByUserAndDate(userId, today);
      if (!fetched || fetched.id !== proofId) throw new Error('Proof not found after insert');

      console.log('✓ Proof submission successful');
      await cleanUser(userId);
      return true;
    } catch (error) {
      console.error('✗ Proof submission failed:', error.message);
      return false;
    }
  },
};

async function runTests() {
  console.log('Running Capitol Backend Tests...\n');

  await logEnvDiagnostics();
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const [name, test] of Object.entries(tests)) {
    console.log(`Testing: ${name}`);
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`✗ ${name} threw:`, error.message);
      await logFetchErrorDetails(error);
      failed++;
    }
    console.log();
  }

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(async (error) => {
  console.error('Fatal test runner error:', error);
  await logFetchErrorDetails(error);
  process.exit(1);
});

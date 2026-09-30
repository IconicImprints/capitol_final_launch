import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ CRITICAL: Supabase credentials not found.');
  console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  console.error('❌ The application cannot function without Supabase.');
  throw new Error('Supabase credentials are required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client with service role key (bypasses RLS for server operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Health check
async function healthCheck() {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    return { ok: true, database: 'connected' };
  } catch (error) {
    console.error('[Supabase] Health check failed:', error.message);
    return { ok: false, database: 'disconnected', error: error.message };
  }
}

// Run migrations (schema is managed in Supabase dashboard)
async function runMigrations() {
  console.log('[Supabase] Migrations are managed in Supabase dashboard');
  console.log('[Supabase] Apply the schema from supabase_complete_schema.sql manually');
  return { ok: true };
}

// Graceful shutdown
async function shutdown() {
  console.log('[Supabase] Client shutdown complete');
}

// Check if database is connected
function isDatabaseConnected() {
  return true; // Supabase client is always "connected" in this context
}

// ============================================================================
// TABLE-SPECIFIC QUERY FUNCTIONS
// These replace the SQL queries with direct Supabase calls
// ============================================================================

// Users
async function getUserById(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error) throw error;
  if (data && data.xp_awarded_keys !== undefined) {
    console.log('[Diagnostics] getUserById xp_awarded_keys type:', typeof data.xp_awarded_keys, 'keys:', Object.keys(data.xp_awarded_keys || {}), 'sample:', JSON.stringify(data.xp_awarded_keys).slice(0, 120));
  }
  return data;
}

async function getUserByEmail(email) {
  const { data, error } = await supabase.from('users').select('*').eq('email', email.toLowerCase()).single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data;
}

async function getUserByUsername(username) {
  const { data, error } = await supabase.from('users').select('*').eq('username', username).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function createUser(userData) {
  const { data, error } = await supabase.from('users').insert([userData]).select().single();
  if (error) throw error;
  return data;
}

async function updateUser(id, updates) {
  const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function getAllUsers(limit = 100) {
  const { data, error } = await supabase.from('users').select('*').eq('is_banned', false).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

async function getLeaderboard(limit = 200) {
  const { data, error } = await supabase.from('users').select('*').eq('is_banned', false).order('xp', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

// Sessions
async function createSession(sessionData) {
  const { data, error } = await supabase.from('sessions').insert([sessionData]).select().single();
  if (error) throw error;
  return data;
}

async function getSession(token) {
  const { data, error } = await supabase.from('sessions').select('*, users(*)').eq('token', token).gt('expires_at', new Date().toISOString()).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function deleteSession(token) {
  const { error } = await supabase.from('sessions').delete().eq('token', token);
  if (error) throw error;
}

async function deleteAllUserSessions(userId) {
  const { error } = await supabase.from('sessions').delete().eq('user_id', userId);
  if (error) throw error;
}

async function deleteExpiredSessions() {
  const { error } = await supabase.from('sessions').delete().lt('expires_at', new Date().toISOString());
  if (error) throw error;
}

// Rooms
async function getAllRooms() {
  const { data, error } = await supabase.from('rooms').select('*').eq('status', 'active').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getRoomById(id) {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function createRoom(roomData) {
  const { data, error } = await supabase.from('rooms').insert([roomData]).select().single();
  if (error) throw error;
  return data;
}

async function updateRoom(id, updates) {
  const { data, error } = await supabase.from('rooms').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Room Members
async function getRoomMembers(roomId) {
  const { data, error } = await supabase.from('room_members').select('*, users(*)').eq('room_id', roomId).eq('status', 'active');
  if (error) throw error;
  return data;
}

async function getRoomMemberCount(roomId) {
  const { data, error, count } = await supabase.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', roomId).eq('status', 'active');
  if (error) throw error;
  return count || 0;
}

async function getUserRoomMembership(userId, roomId) {
  const { data, error } = await supabase.from('room_members').select('*').eq('room_id', roomId).eq('user_id', userId).eq('status', 'active').single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getUserActiveRoom(userId) {
  const { data, error } = await supabase.from('room_members').select('*, rooms(*)').eq('user_id', userId).eq('status', 'active').single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function createRoomMember(memberData) {
  const { data, error } = await supabase.from('room_members').insert([memberData]).select().single();
  if (error) throw error;
  return data;
}

async function updateRoomMember(roomId, userId, updates) {
  const { data, error } = await supabase.from('room_members').update(updates).eq('room_id', roomId).eq('user_id', userId).select().single();
  if (error) throw error;
  return data;
}

async function leaveAllRooms(userId) {
  const { error } = await supabase.from('room_members').update({ status: 'left', left_at: new Date().toISOString() }).eq('user_id', userId).eq('status', 'active');
  if (error) throw error;
}

async function leaveRoom(userId, roomId) {
  const { data, error } = await supabase.from('room_members').update({ status: 'left', left_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', userId).select().single();
  if (error) throw error;
  return data;
}

// Proofs
async function getProofs(userId, limit = 50) {
  let query = supabase.from('proofs').select('*, users(display_name, photo_url)').order('created_at', { ascending: false }).limit(limit);
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getProofByUserAndDate(userId, dateKey) {
  const { data, error } = await supabase.from('proofs').select('*').eq('user_id', userId).eq('date_key', dateKey).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getUserProofDates(userId) {
  const { data, error } = await supabase.from('proofs').select('date_key').eq('user_id', userId).eq('ai_verdict', 'approved').order('date_key');
  if (error) throw error;
  return data;
}

async function createProof(proofData) {
  const { data, error } = await supabase.from('proofs').insert([proofData]).select().single();
  if (error) throw error;
  return data;
}

// Streaks
async function getUserStreak(userId) {
  const { data, error } = await supabase.from('streaks').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function upsertUserStreak(streakData) {
  const { data, error } = await supabase.from('streaks').upsert(streakData).select().single();
  if (error) throw error;
  return data;
}

// Achievements
async function getUserAchievements(userId) {
  const { data, error } = await supabase.from('user_achievements').select('*, achievements(*)').eq('user_id', userId);
  if (error) throw error;
  return data;
}

async function unlockAchievement(achievementData) {
  const { data, error } = await supabase.from('user_achievements').insert([achievementData]).select().single();
  if (error) throw error;
  return data;
}

// Notifications
async function getUserNotifications(userId, limit = 50) {
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

async function createNotification(notificationData) {
  const { data, error } = await supabase.from('notifications').insert([notificationData]).select().single();
  if (error) throw error;
  return data;
}

async function markNotificationsRead(userId, notificationIds) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).in('id', notificationIds);
  if (error) throw error;
}

// Follows
async function createFollow(fromUserId, toUserId) {
  const { data, error } = await supabase.from('follows').insert([{ from_user_id: fromUserId, to_user_id: toUserId }]).select().single();
  if (error) throw error;
  return data;
}

async function deleteFollow(fromUserId, toUserId) {
  const { error } = await supabase.from('follows').delete().eq('from_user_id', fromUserId).eq('to_user_id', toUserId);
  if (error) throw error;
}

// Challenges
async function getUserChallenges(userId) {
  const { data, error } = await supabase.from('challenges').select('*').or(`from_uid.eq.${userId},to_uid.eq.${userId}`);
  if (error) throw error;
  return data;
}

async function createChallenge(challengeData) {
  const { data, error } = await supabase.from('challenges').insert([challengeData]).select().single();
  if (error) throw error;
  return data;
}

async function updateChallenge(id, updates) {
  const { data, error } = await supabase.from('challenges').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Close Friends
async function getCloseFriends(userId) {
  const { data, error } = await supabase.from('close_friends').select('*, users!close_friends_a_fkey(*), users!close_friends_b_fkey(*)').or(`a.eq.${userId},b.eq.${userId}`);
  if (error) throw error;
  return data;
}

async function getCloseFriendRequests(userId) {
  const { sent, received } = await Promise.all([
    supabase.from('close_friend_requests').select('*').eq('from_user_id', userId).eq('status', 'pending'),
    supabase.from('close_friend_requests').select('*').eq('to_user_id', userId).eq('status', 'pending')
  ]);
  if (sent.error) throw sent.error;
  if (received.error) throw received.error;
  return { sent: sent.data, received: received.data };
}

async function createCloseFriendRequest(requestData) {
  const { data, error } = await supabase.from('close_friend_requests').insert([requestData]).select().single();
  if (error) throw error;
  return data;
}

async function updateCloseFriendRequest(id, updates) {
  const { data, error } = await supabase.from('close_friend_requests').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteCloseFriend(userId, friendId) {
  const { error } = await supabase.from('close_friends').delete().or(`and(a.eq.${userId},b.eq.${friendId}),and(a.eq.${friendId},b.eq.${userId})`);
  if (error) throw error;
}

// Freeze Tokens
async function getUserFreezeTokens(userId) {
  const { data, error } = await supabase.from('freeze_tokens').select('*').eq('user_id', userId).eq('used', false).order('bought_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createFreezeToken(tokenData) {
  const { data, error } = await supabase.from('freeze_tokens').insert([tokenData]).select().single();
  if (error) throw error;
  return data;
}

async function useFreezeToken(tokenId) {
  const { data, error } = await supabase.from('freeze_tokens').update({ used: true }).eq('id', tokenId).select().single();
  if (error) throw error;
  return data;
}

// Waiting Queue
async function getWaitingQueueEntry(userId) {
  const { data, error } = await supabase.from('waiting_queue').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getWaitingQueueSize() {
  const { data, error, count } = await supabase.from('waiting_queue').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function joinWaitingQueue(queueData) {
  const { data, error } = await supabase.from('waiting_queue').upsert(queueData).select().single();
  if (error) throw error;
  return data;
}

async function leaveWaitingQueue(userId) {
  const { error } = await supabase.from('waiting_queue').delete().eq('user_id', userId);
  if (error) throw error;
}

async function getAvailableRooms(niche, ageRange) {
  const { data, error } = await supabase.from('rooms').select('*, room_members(count)').eq('status', 'active').eq('niche', niche).order('created_at', { ascending: false }).limit(5);
  if (error) throw error;
  return data;
}

// Replacement Queue
async function createReplacementQueueEntry(queueData) {
  const { data, error } = await supabase.from('replacement_queue').insert([queueData]).select().single();
  if (error) throw error;
  return data;
}

// Config
async function getConfig(key) {
  const { data, error } = await supabase.from('config').select('*').eq('key', key).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function updateConfig(key, value) {
  const { data, error } = await supabase.from('config').update({ value }).eq('key', key).select().single();
  if (error) throw error;
  return data;
}

// Activity Log
async function logActivity(activityData) {
  const { data, error } = await supabase.from('activity_log').insert([activityData]).select().single();
  if (error) throw error;
  return data;
}

// Moderation
async function getRecentModerationEvents(limit = 50) {
  const { data, error } = await supabase.from('moderation_events').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

async function getUserModerationHistory(userId) {
  const { data, error } = await supabase.from('moderation_events').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getUserStrikes(userId) {
  const { data, error } = await supabase.from('user_strikes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createModerationEvent(eventData) {
  const { data, error } = await supabase.from('moderation_events').insert([eventData]).select().single();
  if (error) throw error;
  return data;
}

async function updateUserStrike(strikeData) {
  const { data, error } = await supabase.from('user_strikes').insert([strikeData]).select().single();
  if (error) throw error;
  return data;
}

// ============================================================================
// ATOMIC DATABASE OPERATIONS (Supabase RPC / Postgres stored procedures)
// These guarantee multi-step writes cannot leave partial state behind.
// ============================================================================

function unwrapRpcData(data) {
  if (data == null) return data;
  if (Array.isArray(data)) {
    if (data.length > 0 && Array.isArray(data[0])) return data[0][0];
    return data[0];
  }
  if (data && typeof data === 'object' && 'data' in data) {
    return unwrapRpcData(data.data);
  }
  return data;
}

async function signupAtomic(signupData) {
  const { data, error } = await supabase.rpc('atomic_signup', signupData);
  if (error) throw error;
  return data;
}

async function createRoomAtomic(roomData) {
  const { data, error } = await supabase.rpc('atomic_create_room_with_membership', roomData);
  if (error) throw error;
  return data;
}

async function submitProofAtomic(proofData) {
  const { data, error } = await supabase.rpc('atomic_submit_proof', proofData);
  if (error) throw error;
  const sample = unwrapRpcData(data) || {};
  console.log('[RPC:submitProofAtomic]', 'typeof:', typeof data, 'array:', Array.isArray(data), 'keys:', Object.keys(sample).slice(0, 20), 'sample:', JSON.stringify(sample).slice(0, 200));
  return unwrapRpcData(data);
}

async function updateUserXPAtomic(userId, amount, reason) {
  const { data, error } = await supabase.rpc('atomic_update_user_xp', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason
  });
  if (error) throw error;
  const sample = unwrapRpcData(data) || {};
  console.log('[RPC:updateUserXPAtomic]', 'typeof:', typeof data, 'array:', Array.isArray(data), 'keys:', Object.keys(sample).slice(0, 20), 'sample:', JSON.stringify(sample).slice(0, 200));
  return unwrapRpcData(data);
}

// ============================================================================
// TRANSACTION SIMULATION WITH BEST-EFFORT ROLLBACK
// ============================================================================
async function transaction(callback) {
  const rollbackStack = [];
  const executedOperations = [];

  async function executeWithRollback(table, operation, args) {
    const result = await executeOperation(table, operation, ...args);
    executedOperations.push({ table, operation, args, result });
    rollbackStack.push(async () => {
      try {
        if (operation === 'insert') {
          const { error } = await supabase.from(table).delete().eq('id', args[0]?.id || args[0]);
          if (error) console.error('[Supabase] Rollback delete failed:', error);
        } else if (operation === 'update') {
          const { error } = await supabase.from(table).update(args[1]?.updates || {}).eq('id', args[0]);
          if (error) console.error('[Supabase] Rollback update failed:', error);
        } else if (operation === 'delete') {
          const { error } = await supabase.from(table).insert(args);
          if (error) console.error('[Supabase] Rollback insert failed:', error);
        }
      } catch (rollbackError) {
        console.error('[Supabase] Rollback error:', rollbackError);
      }
    });
    return result;
  }

  try {
    const result = await callback({
      query: async (table, operation, ...args) => {
        return executeWithRollback(table, operation, ...args);
      }
    });
    return result;
  } catch (error) {
    console.error('[Supabase] Transaction failed, attempting rollback:', error);
    for (const rollbackFn of rollbackStack.reverse()) {
      await rollbackFn();
    }
    throw error;
  }
}

async function executeOperation(table, operation, ...args) {
  switch (operation) {
    case 'select':
      return supabase.from(table).select(...args);
    case 'insert':
      return supabase.from(table).insert(...args);
    case 'update':
      return supabase.from(table).update(...args);
    case 'delete':
      return supabase.from(table).delete(...args);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ============================================================================
// COMPATIBILITY LAYER FOR EXISTING CODE
// ============================================================================
// These functions maintain the same interface as the PostgreSQL client
// to minimize code changes in the rest of the application

async function query(text, params) {
  console.warn('[Supabase] Direct SQL queries are not supported. Use specific table functions instead.');
  console.warn('[Supabase] Query:', text.substring(0, 100));
  throw new Error('Direct SQL queries not supported in Supabase mode. Use specific table functions.');
}

// ============================================================================
// ADDITIONAL HELPER FUNCTIONS FOR COMPLEX OPERATIONS
// ============================================================================

// Leave all active rooms for a user
async function leaveAllRoomsForUser(userId) {
  const { error } = await supabase
    .from('room_members')
    .update({ status: 'left', left_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw error;
}

// Update user XP with key tracking
async function updateUserXPWithKey(userId, amount, reason) {
  const key = `xp_${reason}_${new Date().toISOString().slice(0, 10)}`;
  
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('xp, xp_awarded_keys')
    .eq('id', userId)
    .single();
  
  if (fetchError) throw fetchError;
  
  const currentXP = userData.xp || 0;
  const newXP = Math.max(0, currentXP + amount);
  const currentKeys = userData.xp_awarded_keys || {};
  const updatedKeys = { ...currentKeys, [key]: true };
  
  const level = calcLevel(newXP);
  
  const { error: updateError } = await supabase
    .from('users')
    .update({ 
      xp: newXP,
      level: level,
      xp_awarded_keys: updatedKeys
    })
    .eq('id', userId);
  
  if (updateError) throw updateError;
  
  return { xp: newXP, level, xp_awarded_keys: updatedKeys };
}

// Calculate level from XP
function calcLevel(xp) {
  if (!xp || xp < 0) return 1;
  let l = 1;
  while (50 * l ** 1.4 <= xp) l++;
  return Math.max(1, l);
}

// Update user with room join info
async function updateUserRoomJoin(userId, roomId, joinedAt) {
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('joined_rooms')
    .eq('id', userId)
    .single();
  
  if (fetchError) throw fetchError;
  
  const { error: updateError } = await supabase
    .from('users')
    .update({ 
      room_joined_at: joinedAt,
      joined_rooms: (userData.joined_rooms || 0) + 1
    })
    .eq('id', userId);
  
  if (updateError) throw updateError;
}

// Clear user room join info
async function clearUserRoomJoin(userId) {
  const { error } = await supabase
    .from('users')
    .update({ room_joined_at: null })
    .eq('id', userId);
  if (error) throw error;
}

// Check and queue room replacement if needed
async function checkAndQueueReplacement(roomId) {
  const memberCount = await getRoomMemberCount(roomId);
  
  const { data: configData, error: configError } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'system')
    .single();
  
  if (configError && configError.code !== 'PGRST116') throw configError;
  
  const config = configData?.value || {};
  const minRoomSize = config.minRoomSize || 3;
  
  if (memberCount > 0 && memberCount < minRoomSize) {
    const replacementId = `rep_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    await createReplacementQueueEntry({
      id: replacementId,
      room_id: roomId,
      status: 'pending',
      created_at: new Date().toISOString(),
      attempts: 0
    });
  }
}

// Update user kick status
async function updateUserKickStatus(userId, status, reason, burnedAt) {
  const updateData = {
    kicked_from_room: status === 'inactive',
    kick_status: status
  };
  
  if (reason === 'inactive') {
    updateData.burned_at = burnedAt;
  } else {
    updateData.burned_at = null;
  }
  
  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId);
  
  if (error) throw error;
}

// Clear user kick status
async function clearUserKickStatus(userId, roomJoinedAt) {
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('joined_rooms')
    .eq('id', userId)
    .single();
  
  if (fetchError) throw fetchError;
  
  const { error: updateError } = await supabase
    .from('users')
    .update({
      kicked_from_room: false,
      kick_status: 'ok',
      burned_at: null,
      room_joined_at: roomJoinedAt,
      joined_rooms: (userData.joined_rooms || 0) + 1
    })
    .eq('id', userId);
  
  if (updateError) throw updateError;
}

// Complex room join operation with capacity checks
async function joinRoomWithChecks(userId, roomId) {
  const now = new Date().toISOString();
  
  // Get room details
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  
  if (roomError || !room) {
    throw Object.assign(new Error('Room not found'), { status: 404 });
  }
  
  // Check if user is already in this room
  const { data: existingMember, error: memberError } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  
  if (existingMember) {
    throw Object.assign(new Error('Already in room'), { status: 409, alreadyInRoom: true });
  }
  
  // Check capacity
  const memberCount = await getRoomMemberCount(roomId);
  if (memberCount >= (room.max_members || 8)) {
    throw Object.assign(new Error('Room is full'), { status: 400 });
  }
  
  // Leave other active rooms
  await leaveAllRoomsForUser(userId);
  
  // Upsert membership
  const memberId = `rm_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  
  // Try to update existing membership first
  const { data: updateData, error: updateError } = await supabase
    .from('room_members')
    .update({
      status: 'active',
      joined_at: now,
      left_at: null
    })
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .select();
  
  if (updateError || !updateData || updateData.length === 0) {
    // Insert new membership
    const { error: insertError } = await supabase
      .from('room_members')
      .insert([{
        id: memberId,
        room_id: roomId,
        user_id: userId,
        status: 'active',
        joined_at: now
      }]);
    
    if (insertError) throw insertError;
  }
  
  // Clear user kick flags
  await clearUserKickStatus(userId, now);
  
  return { ok: true };
}

// Kick user from room
async function kickUserFromRoom(roomId, targetId, reason, kickerId) {
  const now = new Date().toISOString();
  
  // Get room details
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  
  if (roomError || !room) {
    throw Object.assign(new Error('Room not found'), { status: 404 });
  }
  
  // Get user details
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', targetId)
    .single();
  
  if (userError || !user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
  
  // Update room member status to 'kicked'
  const { error: memberError } = await supabase
    .from('room_members')
    .update({
      status: 'kicked',
      left_at: now
    })
    .eq('room_id', roomId)
    .eq('user_id', targetId)
    .eq('status', 'active');
  
  if (memberError) throw memberError;
  
  // Clear target's active-room pointer
  await clearUserRoomJoin(targetId);
  
  // Update user kick status
  if (reason === 'inactive') {
    await updateUserKickStatus(targetId, 'inactive', 'inactive', now);
  } else {
    await updateUserKickStatus(targetId, 'ok', null, null);
  }
  
  // Apply XP penalty
  await updateUserXPWithKey(targetId, -20, 'kick_penalty');
  
  // Create notification
  const notifId = `notif_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  await createNotification({
    id: notifId,
    user_id: targetId,
    type: 'kick',
    read: false,
    created_at: now,
    data: {
      reason: reason === 'inactive' ? 'Inactive for 3+ days' : 'Removed from room',
      roomId: roomId,
      roomName: room.name
    }
  });
  
  // Check if room needs replacement
  await checkAndQueueReplacement(roomId);
  
  return { ok: true };
}

export {
  supabase,
  query,
  transaction,
  runMigrations,
  healthCheck,
  shutdown,
  isDatabaseConnected,
  signupAtomic,
  createRoomAtomic,
  submitProofAtomic,
  updateUserXPAtomic,
  // User functions
  getUserById,
  getUserByEmail,
  getUserByUsername,
  createUser,
  updateUser,
  getAllUsers,
  getLeaderboard,
  // Session functions
  createSession,
  getSession,
  deleteSession,
  deleteAllUserSessions,
  deleteExpiredSessions,
  // Room functions
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  // Room member functions
  getRoomMembers,
  getRoomMemberCount,
  getUserRoomMembership,
  getUserActiveRoom,
  createRoomMember,
  updateRoomMember,
  leaveAllRooms,
  leaveRoom,
  // Proof functions
  getProofs,
  getProofByUserAndDate,
  getUserProofDates,
  createProof,
  // Streak functions
  getUserStreak,
  upsertUserStreak,
  // Achievement functions
  getUserAchievements,
  unlockAchievement,
  // Notification functions
  getUserNotifications,
  createNotification,
  markNotificationsRead,
  // Follow functions
  createFollow,
  deleteFollow,
  // Challenge functions
  getUserChallenges,
  createChallenge,
  updateChallenge,
  // Close friend functions
  getCloseFriends,
  getCloseFriendRequests,
  createCloseFriendRequest,
  updateCloseFriendRequest,
  deleteCloseFriend,
  // Freeze token functions
  getUserFreezeTokens,
  createFreezeToken,
  useFreezeToken,
  // Waiting queue functions
  getWaitingQueueEntry,
  getWaitingQueueSize,
  joinWaitingQueue,
  leaveWaitingQueue,
  getAvailableRooms,
  // Replacement queue functions
  createReplacementQueueEntry,
  // Config functions
  getConfig,
  updateConfig,
  // Activity log functions
  logActivity,
  // Moderation functions
  getRecentModerationEvents,
  getUserModerationHistory,
  getUserStrikes,
  createModerationEvent,
  updateUserStrike,
  // Additional helper functions
  leaveAllRoomsForUser,
  updateUserXPWithKey,
  calcLevel,
  updateUserRoomJoin,
  clearUserRoomJoin,
  checkAndQueueReplacement,
  updateUserKickStatus,
  clearUserKickStatus,
  joinRoomWithChecks,
  kickUserFromRoom
};

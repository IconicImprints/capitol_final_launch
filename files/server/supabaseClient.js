import { createClient } from '@supabase/supabase-js';

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
// TRANSACTION SIMULATION
// ============================================================================
async function transaction(callback) {
  // Supabase doesn't have client-side transactions in the traditional sense
  // We'll execute operations sequentially and rollback on error
  const operations = [];
  
  try {
    const result = await callback({
      // Provide a client-like interface
      query: async (table, operation, ...args) => {
        operations.push({ table, operation, args });
        // Execute immediately (in production, you'd want proper transaction handling)
        return executeOperation(table, operation, ...args);
      }
    });
    return result;
  } catch (error) {
    console.error('[Supabase] Transaction failed:', error);
    // In a real transaction, we'd rollback here
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

export {
  supabase,
  query,
  transaction,
  runMigrations,
  healthCheck,
  shutdown,
  isDatabaseConnected,
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
  updateUserStrike
};

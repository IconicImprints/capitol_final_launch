/**
 * Capitol Production API
 * PostgreSQL-based backend for scalability
 */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  supabase,
  transaction,
  runMigrations,
  healthCheck,
  shutdown,
  signupAtomic,
  createRoomAtomic,
  submitProofAtomic,
  updateUserXPAtomic,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  createUser,
  updateUser,
  getAllUsers,
  getLeaderboard,
  getSession,
  deleteSession,
  deleteAllUserSessions,
  deleteExpiredSessions,
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  getRoomMembers,
  getRoomMemberCount,
  getUserRoomMembership,
  getUserActiveRoom,
  createRoomMember,
  updateRoomMember,
  leaveAllRooms,
  leaveRoom,
  getProofs,
  getProofByUserAndDate,
  getUserProofDates,
  createProof,
  getUserStreak,
  upsertUserStreak,
  getUserAchievements,
  unlockAchievement,
  getUserNotifications,
  createNotification,
  markNotificationsRead,
  createFollow,
  deleteFollow,
  getUserChallenges,
  createChallenge,
  updateChallenge,
  getCloseFriends,
  getCloseFriendRequests,
  createCloseFriendRequest,
  updateCloseFriendRequest,
  deleteCloseFriend,
  getUserFreezeTokens,
  createFreezeToken,
  useFreezeToken,
  getWaitingQueueEntry,
  getWaitingQueueSize,
  joinWaitingQueue,
  leaveWaitingQueue,
  getAvailableRooms,
  createReplacementQueueEntry,
  getConfig,
  updateConfig,
  logActivity,
  leaveAllRoomsForUser,
  updateUserXPWithKey,
  calcLevel,
  updateUserRoomJoin,
  clearUserRoomJoin,
  checkAndQueueReplacement,
  updateUserKickStatus,
  clearUserKickStatus,
  joinRoomWithChecks,
  kickUserFromRoom,
  uploadFileToStorage
} from './supabaseClient.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  destroySession,
  destroyAllUserSessions,
  startCleanupInterval
} from './auth.js';
import { storage } from './storage.js';
import {
  securityHeaders,
  rateLimiter,
  authRateLimiter,
  proofRateLimiter,
  authenticate,
  optionalAuth,
  requireAdmin,
  requestLogger
} from './middleware.js';
import {
  getRecentModerationEvents,
  getUserModerationHistory,
  getUserStrikes,
  markFalsePositive,
  updateProhibitedTerm,
  moderateContent,
  CONTENT_TYPES
} from './moderation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3001);
const app = express();

// Trust proxy for rate limiting - always trust proxy for development/production
app.set('trust proxy', 1);

// Middleware
app.use(securityHeaders);

// CORS configuration - restrict to specific origins in production
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [])
  : true;

app.use(cors({ 
  origin: corsOrigin, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '12mb' }));
app.use(requestLogger);
app.use(rateLimiter);

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1y', // Cache for 1 year
  etag: true,
  setHeaders: (res, filePath) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
  }
}));

// File upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    cb(null, allowed.has(file.mimetype));
  },
});

// Utility functions
function uid() {
  return 'u_' + crypto.randomBytes(8).toString('hex');
}

function rid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    email: undefined,
    photo_url: u.photo_url || null,
    avatar_config: u.avatar_config || null,
    banner_url: u.banner_url || '',
    bio: u.bio || '',
    pronouns: u.pronouns || '',
    timezone: u.timezone || 'UTC',
    social_links: u.social_links || {},
    is_admin: !!u.is_admin,
    is_banned: !!u.is_banned,
    is_suspended: !!u.is_suspended,
    suspension_end: u.suspension_end || null,
    suspend_reason: u.suspend_reason || null,
    created_at: u.created_at,
    last_seen_at: u.last_seen_at,
    xp: u.xp ?? 0,
    level: u.level ?? 1,
    streak: u.streak ?? 0,
    best_streak: u.best_streak ?? 0,
    missed_days: u.missed_days ?? 0,
    warned: !!u.warned,
    kick_status: u.kick_status || 'ok',
    kicked_from_room: !!u.kicked_from_room,
    proofs_count: u.proofs_count ?? 0,
    completed_rooms: u.completed_rooms ?? 0,
    joined_rooms: u.joined_rooms ?? 0,
    join_timestamp: u.join_timestamp || null,
    consistency_score: u.consistency_score ?? 0,
    near_miss_count: u.near_miss_count ?? 0,
    league: u.league || 'bronze',
    grace_active: !!u.grace_active,
    grace_start_date: u.grace_start_date || null,
    grace_days_total: u.grace_days_total ?? 0,
    total_grace_used: u.total_grace_used ?? 0,
    last_submit_date: u.last_submit_date || null,
    vulture_claimed: u.vulture_claimed || null,
    onboarding_complete: !!u.onboarding_complete,
    onboarding_questions_complete: !!u.onboarding_questions_complete,
    niche: u.niche || '',
    age_range: u.age_range || '',
    room_joined_at: u.room_joined_at || null,
    onboard_bonus_awarded: !!u.onboard_bonus_awarded,
    safety_accepted: u.safety_accepted ?? null,
    invite_code: u.invite_code || '',
    invites_count: u.invites_count ?? 0,
    burned_at: u.burned_at || null,
    following: u.following || [],
    premium: !!u.premium,
    xp_awarded_keys: u.xp_awarded_keys || {},
  };
}

function selfUser(u) {
  const p = publicUser(u);
  if (!p) return null;
  return { ...p, email: u.email || '' };
}

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const dbHealth = await healthCheck();
  res.json({ ok: true, database: dbHealth });
});

// ── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', authRateLimiter, async (req, res) => {
  const { displayName, username, email, password } = req.body || {};
  
  console.log('[Signup] Request received', { username, email, hasPassword: !!password });
  
  if (!displayName || !username || !email || !password) {
    console.log('[Signup] Missing fields');
    return res.status(400).json({ error: 'Missing fields' });
  }
  
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    console.log('[Signup] Invalid username format');
    return res.status(400).json({ error: 'Invalid username' });
  }
  
  if (String(password).length < 6) {
    console.log('[Signup] Password too short');
    return res.status(400).json({ error: 'Password must be 6+ characters' });
  }

  try {
    console.log('[Signup] Starting moderation check');
    // Moderate username
    const usernameResult = await moderateContent({
      userId: null, // No user ID yet during signup
      content: username,
      contentType: CONTENT_TYPES.USERNAME,
      contentId: null
    });
    
    if (!usernameResult.allowed) {
      console.log('[Signup] Username moderation failed', { action: usernameResult.action });
      return res.status(400).json({
        error: 'Username violates community guidelines',
        moderation: {
          action: usernameResult.action,
          severity: usernameResult.severity
        }
      });
    }

    console.log('[Signup] Starting database transaction');
    const palette = ['#F5C800', '#A7D8DE', '#C4B5FD', '#F9A8D4', '#86EFAC', '#FDBA74'];
    let avatarHash = 0;
    for (const char of String(username).toLowerCase()) {
      avatarHash = (avatarHash * 31 + char.charCodeAt(0)) >>> 0;
    }

    const now = new Date().toISOString();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    const invite = username.toUpperCase().slice(0, 4) + timestamp + random;
    const passwordHash = await hashPassword(password);
    const id = uid();
    const token = generateToken(id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const signupData = {
      p_id: id,
      p_username: username,
      p_email: email.toLowerCase(),
      p_display_name: displayName.trim(),
      p_password_hash: passwordHash,
      p_avatar_config: { background: palette[avatarHash % palette.length], letter: username[0].toUpperCase() },
      p_invite_code: invite,
      p_token: token,
      p_ip_address: req.ip,
      p_user_agent: req.headers['user-agent'],
      p_xp: 0,
      p_level: 1,
      p_streak: 0,
      p_best_streak: 0,
      p_missed_days: 0,
      p_warned: false,
      p_kick_status: 'ok',
      p_kicked_from_room: false,
      p_proofs_count: 0,
      p_completed_rooms: 0,
      p_joined_rooms: 0,
      p_consistency_score: 0,
      p_near_miss_count: 0,
      p_league: 'bronze',
      p_grace_active: false,
      p_grace_start_date: null,
      p_grace_days_total: 0,
      p_total_grace_used: 0,
      p_last_submit_date: null,
      p_onboarding_complete: false,
      p_onboarding_questions_complete: false,
      p_niche: '',
      p_age_range: '',
      p_room_joined_at: null,
      p_onboard_bonus_awarded: false,
      p_safety_accepted: null,
      p_invites_count: 0,
      p_burned_at: null,
      p_following: [],
      p_premium: false,
      p_xp_awarded_keys: {}
    };

    const resultId = await signupAtomic(signupData);
    const userResult = await getUserById(resultId);
    const result = { token, user: selfUser(userResult) };

    console.log('[Signup] Sending response');
    res.json(result);
  } catch (e) {
    console.error('[Signup] Error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Signup failed' });
  }
});

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const user = await getUserByEmail(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last seen and create session
    const token = generateToken(user.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await updateUser(user.id, { last_seen_at: new Date().toISOString() });

    await supabase.from('sessions').insert([{
      token,
      user_id: user.id,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }]);

    res.json({ token, user: selfUser(user) });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  await destroySession(req.token);
  res.json({ ok: true });
});

// ── Users ────────────────────────────────────────────────────────────────────
app.get('/api/users/check/:username', async (req, res) => {
  const user = await getUserByUsername(req.params.username);
  res.json({ taken: !!user });
});

app.get('/api/users', optionalAuth, async (req, res) => {
  const users = await getAllUsers(100);
  res.json({ users: users.map(publicUser) });
});

app.get('/api/users/me', authenticate, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ user: selfUser(user) });
});

app.get('/api/users/:id', optionalAuth, async (req, res) => {
  const user = await getUserById(req.params.id);
  
  if (!user) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (user.is_banned) {
    return res.status(404).json({ error: 'Not found' });
  }

  const isSelf = req.user && req.user.id === user.id;
  res.json({ user: isSelf ? selfUser(user) : publicUser(user) });
});

app.patch('/api/users/me', authenticate, async (req, res) => {
  const body = req.body || {};
  const allowed = [
    'display_name', 'photo_url', 'avatar_config', 'banner_url', 'bio', 'pronouns',
    'timezone', 'social_links', 'niche', 'age_range', 'safety_accepted',
    'onboarding_complete', 'onboarding_questions_complete', 'join_timestamp',
    'room_joined_at', 'room_id',
    'xp', 'streak', 'level', 'missed_days', 'warned', 'kick_status',
    'kicked_from_room', 'proofs_count', 'completed_rooms', 'joined_rooms',
    'last_submit_date', 'last_submission_date', 'grace_active', 'grace_start_date',
    'grace_days_total', 'total_grace_used', 'onboard_bonus_awarded', 'vulture_claimed',
    'safety_accepted_at', 'invite_code', 'invites_count', 'burned_at', 'following',
    'premium', 'xp_awarded_keys', 'consistency_score', 'near_miss_count', 'league',
    'last_seen_date', 'grace_used_this_month', 'grace_last_month'
  ];

  // Moderate display name if present
  if (body.display_name) {
    const displayNameResult = await moderateContent({
      userId: req.user.id,
      content: body.display_name,
      contentType: CONTENT_TYPES.DISPLAY_NAME,
      contentId: req.user.id
    });
    
    if (!displayNameResult.allowed) {
      return res.status(403).json({
        error: displayNameResult.userMessage || 'Display name violates community guidelines',
        moderation: {
          action: displayNameResult.action,
          severity: displayNameResult.severity,
          eventId: displayNameResult.eventId
        }
      });
    }
  }

  // Moderate bio if present
  if (body.bio) {
    const bioResult = await moderateContent({
      userId: req.user.id,
      content: body.bio,
      contentType: CONTENT_TYPES.BIO,
      contentId: req.user.id
    });
    
    if (!bioResult.allowed) {
      return res.status(403).json({
        error: bioResult.userMessage || 'Bio violates community guidelines',
        moderation: {
          action: bioResult.action,
          severity: bioResult.severity,
          eventId: bioResult.eventId
        }
      });
    }
  }

  const updates = {};
  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.json({ user: selfUser(req.user) });
  }

  try {
    await updateUser(req.user.id, updates);

    const result = await getUserById(req.user.id);
    res.json({ user: selfUser(result) });
  } catch (e) {
    console.error('User update error:', e);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── Rooms ────────────────────────────────────────────────────────────────────
app.get('/api/rooms', optionalAuth, async (req, res) => {
  const rooms = await getAllRooms();

  const roomsWithCounts = await Promise.all(
    rooms.map(async (r) => {
      const memberCount = await getRoomMemberCount(r.id);
      return {
        id: r.id,
        name: r.name,
        icon: r.icon || 'bolt',
        goal: r.goal || '',
        niche: r.niche || 'general',
        age_range: r.age_range || null,
        tags: r.tags || [],
        max_members: parseInt(r.max_members) || 8,
        member_count: memberCount,
        elite: !!r.elite,
        days: parseInt(r.days) || 30,
        created_at: r.created_at,
        creator_uid: r.creator_uid || null,
      };
    })
  );

  res.json({ rooms: roomsWithCounts });
});

app.get('/api/rooms/trending', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '4'), 20);
  const rooms = await getAllRooms();
  const roomsWithCounts = await Promise.all(
    rooms.map(async (r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon || 'bolt',
      goal: r.goal || '',
      niche: r.niche || 'general',
      age_range: r.age_range || null,
      tags: r.tags || [],
      max_members: parseInt(r.max_members) || 8,
      member_count: await getRoomMemberCount(r.id),
      elite: !!r.elite,
      days: parseInt(r.days) || 30,
      created_at: r.created_at,
      creator_uid: r.creator_uid || null,
    }))
  );
  roomsWithCounts.sort((a, b) => (b.member_count || 0) - (a.member_count || 0));
  res.json({ rooms: roomsWithCounts.slice(0, limit) });
});

app.get('/api/rooms/:id', optionalAuth, async (req, res) => {
  const room = await getRoomById(req.params.id);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Check membership status
  let membership = 'none';
  if (req.user) {
    const memberData = await getUserRoomMembership(req.user.id, room.id);
    if (memberData) {
      membership = 'active';
    }
  }

  const memberCount = await getRoomMemberCount(room.id);

  res.json({
    room: {
      id: room.id,
      name: room.name,
      icon: room.icon || 'bolt',
      goal: room.goal || '',
      niche: room.niche || 'general',
      age_range: room.age_range || null,
      tags: room.tags || [],
      max_members: parseInt(room.max_members) || 8,
      member_count: memberCount,
      elite: !!room.elite,
      days: parseInt(room.days) || 30,
      created_at: room.created_at,
      creator_uid: room.creator_uid || null,
    },
    membership
  });
});

// Get user's current active room
app.get('/api/users/me/room', authenticate, async (req, res) => {
  try {
    const memberData = await getUserActiveRoom(req.user.id);

    if (!memberData) {
      return res.json({ room: null });
    }

    const room = memberData.rooms;
    const memberCount = await getRoomMemberCount(room.id);

    res.json({
      room: {
        id: room.id,
        name: room.name,
        icon: room.icon || 'bolt',
        goal: room.goal || '',
        niche: room.niche || 'general',
        age_range: room.age_range || null,
        tags: room.tags || [],
        max_members: parseInt(room.max_members) || 8,
        member_count: memberCount,
        elite: !!room.elite,
        days: parseInt(room.days) || 30,
        created_at: room.created_at,
        creator_uid: room.creator_uid || null,
      },
      membership: {
        id: memberData.id,
        status: memberData.status,
        joined_at: memberData.joined_at
      }
    });
  } catch (e) {
    console.error('Get user room error:', e);
    res.status(500).json({ error: 'Failed to get user room' });
  }
});

app.post('/api/rooms', authenticate, async (req, res) => {
  const { name, icon, goal, niche, ageRange, tags, maxMembers, elite, days } = req.body || {};

  try {
    const id = rid('room');
    const now = new Date().toISOString();

    const roomData = {
      p_room_id: id,
      p_user_id: req.user.id,
      p_name: name || 'Room',
      p_icon: icon || 'bolt',
      p_goal: goal || '',
      p_niche: niche || 'general',
      p_age_range: ageRange || null,
      p_tags: tags || [],
      p_max_members: maxMembers || 8,
      p_elite: !!elite,
      p_days: days || 30,
      p_creator_uid: req.user.id,
      p_status: 'active'
    };

    const resultId = await createRoomAtomic(roomData);
    const result = { id: resultId };

    const roomResult = await getRoomById(result.id);
    const memberCount = await getRoomMemberCount(result.id);

    res.json({
      room: {
        id: roomResult.id,
        name: roomResult.name,
        icon: roomResult.icon || 'bolt',
        goal: roomResult.goal || '',
        niche: roomResult.niche || 'general',
        age_range: roomResult.age_range || null,
        tags: roomResult.tags || [],
        max_members: parseInt(roomResult.max_members) || 8,
        member_count: memberCount,
        elite: !!roomResult.elite,
        days: parseInt(roomResult.days) || 30,
        created_at: roomResult.created_at,
        creator_uid: roomResult.creator_uid || null,
      }
    });
  } catch (e) {
    console.error('Room creation error:', e);
    res.status(500).json({ error: 'Room creation failed' });
  }
});

app.post('/api/rooms/:id/join', authenticate, async (req, res) => {
  try {
    await joinRoomWithChecks(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.status === 409 && e.alreadyInRoom) {
      return res.json({ ok: true, alreadyInRoom: true });
    }
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/rooms/:id/leave', authenticate, async (req, res) => {
  try {
    const result = await leaveRoom(req.user.id, req.params.id);

    // Only clear room_joined_at if the user was actually in this room
    if (result) {
      await clearUserRoomJoin(req.user.id);
    }

    // Check if room needs replacement
    await checkAndQueueReplacement(req.params.id);

    res.json({ ok: true });
  } catch (e) {
    console.error('Leave room error:', e);
    res.status(500).json({ error: 'Leave failed' });
  }
});

app.post('/api/rooms/:id/kick', authenticate, async (req, res) => {
  const { targetId, reason } = req.body || {};

  try {
    await kickUserFromRoom(req.params.id, targetId, reason, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Kick error:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Proofs ───────────────────────────────────────────────────────────────────
app.get('/api/proofs', optionalAuth, async (req, res) => {
  const { userId, limit = 50 } = req.query;
  
  const proofs = await getProofs(userId, parseInt(limit));
  
  const formattedProofs = proofs.map(p => ({
    id: p.id,
    user_id: p.user_id,
    date_key: p.date_key,
    created_at: p.created_at,
    image_url: p.image_url,
    link: p.link,
    note: p.note,
    streak: p.streak,
    xp_earned: p.xp_earned,
    ai_verdict: p.ai_verdict,
    room_id: p.room_id,
    votes: typeof p.votes === 'string' ? JSON.parse(p.votes) : p.votes,
    gesture: p.gesture,
    user_name: p.user_name || '',
    user_photo: p.user_photo || null,
  }));

  res.json({ proofs });
});

app.post('/api/proofs', authenticate, proofRateLimiter, async (req, res) => {
  const { imageUrl, link, note, gesture, roomId } = req.body || {};

  try {
    const today = new Date().toISOString().slice(0, 10);
    const userId = req.user.id;

    const existingProof = await getProofByUserAndDate(userId, today);

    if (existingProof) {
      return res.json({
        proof: existingProof,
        stats: { xp: req.user.xp, level: req.user.level, streak: req.user.streak, xpGained: 0 },
        duplicate: true
      });
    }

    const proofDates = await getUserProofDates(userId);
    const dates = new Set(proofDates.map(p => p.date_key));
    dates.add(today);

    let newStreak = 0;
    const cursor = new Date(`${today}T00:00:00Z`);
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      newStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    const xpGain = 10 + Math.min(newStreak, 30) * 2;
    const proofId = rid('proof');

    const { data: userData } = await supabase
      .from('users')
      .select('best_streak, proofs_count')
      .eq('id', userId)
      .single();

    const proofResult = await submitProofAtomic({
      p_proof_id: proofId,
      p_user_id: userId,
      p_date_key: today,
      p_streak: newStreak,
      p_xp_earned: xpGain,
      p_image_url: imageUrl || null,
      p_link: link || '',
      p_note: note || '',
      p_ai_verdict: 'approved',
      p_room_id: roomId || null,
      p_votes: {},
      p_gesture: gesture || null,
      p_best_streak: Math.max(userData?.best_streak || 0, newStreak)
    });

    const milestones = [
      [1, 'First Day', 'Completed your first qualifying proof.'],
      [3, 'Early Momentum', 'Maintained a 3 day streak.'],
      [7, 'Weekly Consistency', 'Maintained a 7 day streak.'],
      [13, 'Elite Consistency', 'Maintained a 13 day streak.'],
    ];

    for (const [days, name, description] of milestones) {
      if (newStreak >= days) {
        const uaId = `ua_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
        await unlockAchievement({
          id: uaId,
          user_id: userId,
          achievement_days: days,
          unlocked_at: new Date().toISOString()
        });
      }
    }

    const user = await getUserById(userId);

    res.json({
      proof: { id: proofId, user_id: userId, date_key: today, created_at: new Date().toISOString() },
      stats: { xp: proofResult.new_xp, level: proofResult.new_level, streak: proofResult.current_streak, xpGained: xpGain }
    });
  } catch (e) {
    console.error('Proof submission error:', e);
    res.status(500).json({ error: 'Proof submission failed' });
  }
});

// ── Image Upload ─────────────────────────────────────────────────────────────
app.post('/api/images/upload', authenticate, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  try {
    const userId = req.user.id;
    const file = req.file;
    const ext = file.originalname.split('.').pop() || 'bin';
    const fileName = `${userId}_${Date.now()}.${ext}`;
    const bucket = 'uploads';

    const result = await uploadFileToStorage(
      file.buffer,
      fileName,
      file.mimetype,
      bucket,
      userId
    );

    res.json({ url: result.url, path: result.path });
  } catch (e) {
    console.error('Image upload error:', e);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// ── Notifications ────────────────────────────────────────────────────────────
app.get('/api/notifications', authenticate, async (req, res) => {
  const notifications = await getUserNotifications(req.user.id, 50);

  const formattedNotifications = notifications.map(n => ({
    id: n.id,
    type: n.type,
    read: !!n.read,
    created_at: n.created_at,
    data: n.data,
  }));

  res.json({ notifications: formattedNotifications });
});

app.post('/api/notifications', authenticate, async (req, res) => {
  const { userId, type, data, eventKey } = req.body || {};

  try {
    // Check for duplicate
    if (eventKey) {
      const existing = await getUserNotifications(userId, 100);
      const duplicate = existing.find(n => n.data?.eventKey === eventKey);
      if (duplicate) {
        return res.json({ notification: duplicate, duplicate: true });
      }
    }

    const id = rid('notif');
    await createNotification({
      id,
      user_id: userId,
      type: type || 'info',
      read: false,
      created_at: new Date().toISOString(),
      data: { ...(data || {}), ...(eventKey ? { eventKey } : {}), fromUid: req.user.id }
    });

    res.json({ notification: { id, user_id: userId, type, read: false, created_at: new Date().toISOString() } });
  } catch (e) {
    console.error('Notification creation error:', e);
    res.status(500).json({ error: 'Notification creation failed' });
  }
});

app.post('/api/notifications/read', authenticate, async (req, res) => {
  const { ids } = req.body || [];
  
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: true });
  }

  await markNotificationsRead(req.user.id, ids);

  res.json({ ok: true });
});

// ── Leaderboard ──────────────────────────────────────────────────────────────
app.get('/api/leaderboard', optionalAuth, async (req, res) => {
  const leaderboard = await getLeaderboard(200);
  res.json({ leaderboard: leaderboard.map(publicUser) });
});

// ── Economy ──────────────────────────────────────────────────────────────────
app.post('/api/economy/xp', authenticate, async (req, res) => {
  const { amount, reason } = req.body || {};
  const xpAmount = Number(amount || 0);

  try {
    const xpResult = await updateUserXPAtomic(req.user.id, xpAmount, reason || 'manual');

    const user = await getUserById(req.user.id);

    res.json({ ok: true, xpGained: xpAmount, xp: xpResult.xp, level: xpResult.level });
  } catch (e) {
    console.error('XP update error:', e);
    res.status(500).json({ error: 'XP update failed' });
  }
});

// ── Images ───────────────────────────────────────────────────────────────────
app.post('/api/images/upload', authenticate, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file' });
  }

  try {
    const key = storage.generateKey(req.file.originalname);
    console.log('[Image Upload] Starting upload', { key, mimetype: req.file.mimetype, size: req.file.size });
    const url = await storage.uploadFile(req.file, key);
    console.log('[Image Upload] Upload completed', { key, url: url.substring(0, 50) + '...' });
    res.json({ url });
  } catch (e) {
    console.error('[Image Upload] Upload failed:', e);
    res.status(500).json({ error: e.message || 'Image upload failed' });
  }
});

// ── Waiting Queue ─────────────────────────────────────────────────────────────
app.post('/api/waiting-queue/join', authenticate, async (req, res) => {
  const { niche, ageRange } = req.body || {};

  try {
    // Remove existing entry
    await leaveWaitingQueue(req.user.id);

    const id = rid('wait');
    await joinWaitingQueue({
      id,
      user_id: req.user.id,
      niche: niche || req.user.niche || '',
      age_range: ageRange || req.user.age_range || '',
      joined_at: new Date().toISOString()
    });

    // Try immediate match
    const availableRooms = await getAvailableRooms(
      niche || req.user.niche || 'general',
      ageRange || req.user.age_range || ''
    );

    for (const room of availableRooms) {
      const memberCount = await getRoomMemberCount(room.id);
      if (memberCount < (room.max_members || 8)) {
        // Join this room immediately
        await leaveAllRoomsForUser(req.user.id);

        const memberId = rid('rm');
        await createRoomMember({
          id: memberId,
          room_id: room.id,
          user_id: req.user.id,
          status: 'active',
          joined_at: new Date().toISOString()
        });

        await updateUserRoomJoin(req.user.id, room.id, new Date().toISOString());

        await leaveWaitingQueue(req.user.id);

        return res.json({ ok: true, queued: false, matched: true, roomId: room.id });
      }
    }

    res.json({ ok: true, queued: true });
  } catch (e) {
    console.error('Waiting queue error:', e);
    res.status(500).json({ error: 'Waiting queue failed' });
  }
});

app.delete('/api/waiting-queue/leave', authenticate, async (req, res) => {
  await leaveWaitingQueue(req.user.id);
  res.json({ ok: true });
});

app.get('/api/waiting-queue/status', authenticate, async (req, res) => {
  const entry = await getWaitingQueueEntry(req.user.id);
  const queueSize = await getWaitingQueueSize();
  
  res.json({
    inQueue: !!entry,
    entry: entry || null,
    queueSize: queueSize || 0
  });
});

// ── Referrals ───────────────────────────────────────────────────────────────
app.get('/api/referrals/code/:code', async (req, res) => {
  const users = await getAllUsers(1000);
  const inviter = users.find(u => u.invite_code && u.invite_code.toUpperCase() === req.params.code.toUpperCase());
  
  if (!inviter) {
    return res.json({ inviter: null });
  }

  res.json({ inviter: publicUser(inviter) });
});

app.post('/api/referrals/process', authenticate, async (req, res) => {
  const { inviterId } = req.body || {};

  try {
    if (inviterId === req.user.id) {
      return res.json({ ok: false });
    }

    const inviter = await getUserById(inviterId);
    if (!inviter) {
      return res.status(404).json({ error: 'Inviter not found' });
    }

    await updateUser(inviterId, { invites_count: (inviter.invites_count || 0) + 1 });
    await updateUserXPWithKey(inviterId, 50, 'referral');

    res.json({ ok: true, xpBonus: 50, milestoneBonus: 0 });
  } catch (e) {
    console.error('Referral processing error:', e);
    res.status(500).json({ error: 'Referral processing failed' });
  }
});

// ── Follows ─────────────────────────────────────────────────────────────────
app.post('/api/users/follow/:targetId', authenticate, async (req, res) => {
  const targetId = req.params.targetId;

  try {
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot follow self' });
    }

    await createFollow(req.user.id, targetId);

    // Update user's following list
    const target = await getUserById(targetId);
    const currentUser = await getUserById(req.user.id);
    
    const init = (target.username || '?').slice(0, 2).toUpperCase();
    const updatedFollowing = [...(currentUser.following || []), init].filter((v, i, a) => a.indexOf(v) === i);
    
    await updateUser(req.user.id, { following: updatedFollowing });

    // Create notification
    const notifId = rid('notif');
    await createNotification({
      id: notifId,
      user_id: targetId,
      type: 'follow',
      read: false,
      created_at: new Date().toISOString(),
      data: {
        fromUid: req.user.id,
        fromName: req.user.display_name,
        fromUsername: req.user.username
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('Follow error:', e);
    res.status(500).json({ error: 'Follow failed' });
  }
});

app.delete('/api/users/follow/:targetId', authenticate, async (req, res) => {
  const targetId = req.params.targetId;

  try {
    await deleteFollow(req.user.id, targetId);
    
    const target = await getUserById(targetId);
    const currentUser = await getUserById(req.user.id);
    const init = (target.username || '?').slice(0, 2).toUpperCase();
    
    const updatedFollowing = (currentUser.following || []).filter(f => f !== init);
    await updateUser(req.user.id, { following: updatedFollowing });

    res.json({ ok: true });
  } catch (e) {
    console.error('Unfollow error:', e);
    res.status(500).json({ error: 'Unfollow failed' });
  }
});

// ── Close Friends ─────────────────────────────────────────────────────────────
app.get('/api/close-friends', authenticate, async (req, res) => {
  try {
    const closeFriendsData = await getCloseFriends(req.user.id);
    
    const friendIds = closeFriendsData.map(f => f.a === req.user.id ? f.b : f.a);
    
    if (friendIds.length === 0) {
      return res.json({ friends: [] });
    }
    
    const friends = await Promise.all(
      friendIds.map(id => getUserById(id))
    );
    
    res.json({ friends: friends.filter(f => f).map(publicUser) });
  } catch (e) {
    console.error('Get close friends error:', e);
    res.status(500).json({ error: 'Failed to get close friends' });
  }
});

app.get('/api/close-friends/requests', authenticate, async (req, res) => {
  try {
    const { sent, received } = await getCloseFriendRequests(req.user.id);
    res.json({ sent, received });
  } catch (e) {
    console.error('Get friend requests error:', e);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

app.post('/api/close-friends/request', authenticate, async (req, res) => {
  const { targetId } = req.body || {};
  
  try {
    if (targetId === req.user.id) {
      throw Object.assign(new Error('Cannot friend self'), { status: 400 });
    }
    
    const requestId = rid('cfr');
    await createCloseFriendRequest({
      id: requestId,
      from_user_id: req.user.id,
      to_user_id: targetId,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    
    const notifId = rid('notif');
    await createNotification({
      id: notifId,
      user_id: targetId,
      type: 'friend_request',
      read: false,
      created_at: new Date().toISOString(),
      data: {
        requestId,
        fromUid: req.user.id,
        fromName: req.user.display_name,
        fromUsername: req.user.username
      }
    });
    
    res.json({ ok: true, requestId });
  } catch (e) {
    console.error('Send friend request error:', e);
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to send friend request' });
    }
  }
});

app.post('/api/close-friends/respond', authenticate, async (req, res) => {
  const { requestId, accept } = req.body || {};
  
  try {
    const allRequests = await getCloseFriendRequests(req.user.id);
    const request = [...allRequests.sent, ...allRequests.received].find(r => r.id === requestId);
    
    if (!request || request.to_user_id !== req.user.id) {
      throw Object.assign(new Error('Request not found'), { status: 404 });
    }
    
    await updateCloseFriendRequest(requestId, { status: accept ? 'accepted' : 'declined' });
    
    if (accept) {
      const friendId = rid('cf');
      // We need to manually insert into close_friends since there's no helper for this specific case
      const { error } = await supabase.from('close_friends').insert([{
        id: friendId,
        a: request.from_user_id,
        b: request.to_user_id,
        created_at: new Date().toISOString()
      }]);
      
      if (error) throw error;
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Respond to friend request error:', e);
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to respond to friend request' });
    }
  }
});

app.delete('/api/close-friends/:friendId', authenticate, async (req, res) => {
  const friendId = req.params.friendId;
  
  try {
    await deleteCloseFriend(req.user.id, friendId);
    res.json({ ok: true });
  } catch (e) {
    console.error('Remove friend error:', e);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// ── Grace Period ───────────────────────────────────────────────────────────────
app.post('/api/grace/activate', authenticate, async (req, res) => {
  const { days, reason } = req.body || {};
  const n = parseInt(days, 10);
  
  try {
    if (isNaN(n) || n < 1) {
      throw Object.assign(new Error('Invalid days'), { status: 400 });
    }
    
    if (!reason || reason.trim().length < 10) {
      throw Object.assign(new Error('Reason too short'), { status: 400 });
    }
    
    const user = await getUserById(req.user.id);
    
    const thisMonth = new Date().toISOString().slice(0, 7);
    const graceLastMonth = user.grace_last_month || '';
    const graceUsedThisMonth = user.grace_used_this_month || 0;
    const effectiveUsed = graceLastMonth === thisMonth ? graceUsedThisMonth : 0;
    
    if (effectiveUsed >= 2) {
      throw Object.assign(new Error('You\'ve used both grace slots this month'), { status: 400 });
    }
    
    if (user.grace_active) {
      throw Object.assign(new Error('Grace period is already active'), { status: 400 });
    }
    
    if (user.kick_status === 'kicked') {
      throw Object.assign(new Error('Grace cannot be activated after a kick'), { status: 400 });
    }
    
    const xpCost = n * 5;
    const currentStreak = user.streak || 0;
    
    await updateUserXPWithKey(req.user.id, -xpCost, 'grace');
    
    await updateUser(req.user.id, {
      grace_active: true,
      grace_start_date: new Date().toISOString(),
      grace_days_total: n,
      grace_used_this_month: effectiveUsed + 1,
      grace_last_month: thisMonth,
      kick_status: 'ok',
      warned: false,
      missed_days: 0,
      streak: currentStreak
    });
    
    res.json({ ok: true, days: n, xpCost, streak: currentStreak });
  } catch (e) {
    console.error('Grace activation error:', e);
    if (e.status) {
      res.status(e.status).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Grace activation failed' });
    }
  }
});

// ── Inactivity Check (3-day rule) ───────────────────────────────────────────────
// Run daily to check for inactive users and apply warnings/kicks
app.post('/api/admin/check-inactivity', requireAdmin, async (req, res) => {
  try {
    const configData = await getConfig('system');
    const config = configData?.value || {};
    const inactivityThresholdDays = config.inactivityThresholdDays || 3;
    
    // Get all active room members with user data
    const { data: membersData, error: membersError } = await supabase
      .from('room_members')
      .select('*, users(*)')
      .eq('status', 'active');
    
    if (membersError) throw membersError;
    
    const today = new Date();
    const warningsIssued = [];
    const kicksIssued = [];
    
    for (const member of membersData) {
      const user = member.users;
      const lastSubmitDate = user.last_submit_date ? new Date(user.last_submit_date) : null;
      const daysSince = lastSubmitDate ? Math.floor((today - lastSubmitDate) / (1000 * 60 * 60 * 24)) : 999;
      
      if (daysSince >= inactivityThresholdDays) {
        // 3+ days missed - kick the user
        await supabase
          .from('room_members')
          .update({ 
            status: 'kicked', 
            left_at: new Date().toISOString(),
            inactive_since: new Date().toISOString(),
            inactive_reason: 'No proof for 3+ days'
          })
          .eq('id', member.id);
        
        await updateUser(user.id, {
          kicked_from_room: true,
          kick_status: 'inactive',
          burned_at: new Date().toISOString(),
          missed_days: 3
        });
        
        // Apply XP penalty
        await updateUserXPWithKey(user.id, -20, 'inactive_kick');
        
        // Create notification
        const notifId = rid('notif');
        await createNotification({
          id: notifId,
          user_id: user.id,
          type: 'kick',
          read: false,
          created_at: new Date().toISOString(),
          data: {
            reason: 'Inactive for 3+ days',
            roomId: member.room_id
          }
        });
        
        kicksIssued.push({ userId: user.id, username: user.username, daysSince });
      } else if (daysSince === 2) {
        // 2 days missed - issue warning
        if (user.kick_status !== 'warned') {
          await updateUser(user.id, {
            kick_status: 'warned',
            missed_days: 2
          });
          
          // Create warning notification
          const notifId = rid('notif');
          await createNotification({
            id: notifId,
            user_id: user.id,
            type: 'kick',
            read: false,
            created_at: new Date().toISOString(),
            data: {
              reason: 'Warning: 2 days missed. Submit proof today to avoid removal.',
              roomId: member.room_id
            }
          });
          
          warningsIssued.push({ userId: user.id, username: user.username, daysSince });
        }
      } else if (daysSince === 1) {
        // 1 day missed - flag user
        if (user.kick_status === 'ok') {
          await updateUser(user.id, {
            kick_status: 'flagged',
            missed_days: 1
          });
        }
      }
    }
    
    res.json({ 
      ok: true, 
      checked: membersData.length,
      warningsIssued,
      kicksIssued
    });
  } catch (e) {
    console.error('Inactivity check error:', e);
    res.status(500).json({ error: 'Inactivity check failed' });
  }
});

// ── Freeze Tokens ─────────────────────────────────────────────────────────────
app.get('/api/economy/freeze-tokens', authenticate, async (req, res) => {
  const tokens = await getUserFreezeTokens(req.user.id);
  res.json({ tokens });
});

app.post('/api/economy/buy-freeze', authenticate, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const cost = 100;

    if ((user.xp || 0) < cost) {
      return res.status(400).json({ error: 'Not enough XP' });
    }

    await updateUserXPWithKey(req.user.id, -cost, 'freeze_token');

    const tokenId = rid('ft');
    await createFreezeToken({
      id: tokenId,
      user_id: req.user.id,
      used: false,
      bought_at: new Date().toISOString()
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('Buy freeze token error:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/economy/use-freeze', authenticate, async (req, res) => {
  try {
    const tokens = await getUserFreezeTokens(req.user.id);

    if (tokens.length === 0) {
      return res.status(400).json({ error: 'No tokens available' });
    }

    await useFreezeToken(tokens[0].id);

    res.json({ ok: true });
  } catch (e) {
    console.error('Freeze token error:', e);
    res.status(500).json({ error: 'Freeze token usage failed' });
  }
});

// ── Admin Functions ───────────────────────────────────────────────────────────
app.post('/api/admin/check-activity', authenticate, requireAdmin, async (req, res) => {
  // This would implement the activity check logic from the original system
  // For now, return a placeholder response
  res.json({ 
    ok: true, 
    kickedCount: 0, 
    replacementsProcessed: 0,
    message: 'Activity check not yet implemented in PostgreSQL version'
  });
});

app.get('/api/admin/config', authenticate, requireAdmin, async (req, res) => {
  const configData = await getConfig('system');
  res.json({ config: configData?.value || {} });
});

app.patch('/api/admin/config', authenticate, requireAdmin, async (req, res) => {
  const { inactivityThresholdDays, minRoomSize, maxRoomSize } = req.body || {};

  try {
    const currentConfig = await getConfig('system');
    const currentValue = currentConfig?.value || {};
    
    const newConfig = {
      ...currentValue,
      ...(inactivityThresholdDays !== undefined && { inactivityThresholdDays }),
      ...(minRoomSize !== undefined && { minRoomSize }),
      ...(maxRoomSize !== undefined && { maxRoomSize }),
    };

    await updateConfig('system', newConfig);

    res.json({ config: newConfig });
  } catch (e) {
    console.error('Config update error:', e);
    res.status(500).json({ error: 'Config update failed' });
  }
});

// ── Moderation Admin Endpoints ───────────────────────────────────────────────
app.get('/api/admin/moderation/events', authenticate, requireAdmin, async (req, res) => {
  const { limit = 50 } = req.query;
  try {
    const events = await getRecentModerationEvents(parseInt(limit));
    res.json({ events });
  } catch (e) {
    console.error('Get moderation events error:', e);
    res.status(500).json({ error: 'Failed to get moderation events' });
  }
});

app.get('/api/admin/moderation/user/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const [events, strikes] = await Promise.all([
      getUserModerationHistory(req.params.userId),
      getUserStrikes(req.params.userId)
    ]);
    
    res.json({ events, strikes });
  } catch (e) {
    console.error('Get user moderation history error:', e);
    res.status(500).json({ error: 'Failed to get user moderation history' });
  }
});

app.post('/api/admin/moderation/false-positive/:eventId', authenticate, requireAdmin, async (req, res) => {
  try {
    await markFalsePositive(req.params.eventId, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Mark false positive error:', e);
    res.status(500).json({ error: 'Failed to mark as false positive' });
  }
});

app.post('/api/admin/moderation/prohibited-term', authenticate, requireAdmin, async (req, res) => {
  const { term, category, severity, isActive, requiresContext } = req.body || {};
  
  if (!term || !category || !severity) {
    return res.status(400).json({ error: 'Missing required fields: term, category, severity' });
  }
  
  try {
    await updateProhibitedTerm(term, category, severity, isActive, requiresContext);
    res.json({ ok: true });
  } catch (e) {
    console.error('Update prohibited term error:', e);
    res.status(500).json({ error: 'Failed to update prohibited term' });
  }
});

// ── Challenges ────────────────────────────────────────────────────────────────
app.get('/api/challenges', authenticate, async (req, res) => {
  try {
    const challenges = await getUserChallenges(req.user.id);
    res.json({ challenges });
  } catch (e) {
    console.error('Get challenges error:', e);
    res.status(500).json({ error: 'Failed to get challenges' });
  }
});

app.post('/api/challenges', authenticate, async (req, res) => {
  const { challengedId, durationDays, stakes, message } = req.body || {};
  try {
    if (!challengedId) {
      return res.status(400).json({ error: 'Missing challengedId' });
    }
    const id = rid('challenge');
    const challenge = await createChallenge({
      id,
      from_uid: req.user.id,
      to_uid: challengedId,
      duration_days: durationDays || 7,
      stakes: stakes || 0,
      message: message || '',
      status: 'pending',
      created_at: new Date().toISOString()
    });
    res.json({ challenge });
  } catch (e) {
    console.error('Create challenge error:', e);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

app.post('/api/challenges/:id/accept', authenticate, async (req, res) => {
  try {
    await updateChallenge(req.params.id, { status: 'accepted' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Accept challenge error:', e);
    res.status(500).json({ error: 'Failed to accept challenge' });
  }
});

app.post('/api/challenges/:id/decline', authenticate, async (req, res) => {
  try {
    await updateChallenge(req.params.id, { status: 'declined' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Decline challenge error:', e);
    res.status(500).json({ error: 'Failed to decline challenge' });
  }
});

// ── User Moderation ───────────────────────────────────────────────────────────
app.post('/api/users/:id/ban', authenticate, requireAdmin, async (req, res) => {
  const { reason } = req.body || {};
  try {
    await updateUser(req.params.id, { is_banned: true, suspend_reason: reason || 'Banned by admin' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Ban user error:', e);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

app.post('/api/users/:id/unban', authenticate, requireAdmin, async (req, res) => {
  try {
    await updateUser(req.params.id, { is_banned: false, suspend_reason: null });
    res.json({ ok: true });
  } catch (e) {
    console.error('Unban user error:', e);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

app.post('/api/users/:id/suspend', authenticate, requireAdmin, async (req, res) => {
  const { hours, reason } = req.body || {};
  try {
    const suspensionEnd = new Date(Date.now() + (hours || 24) * 60 * 60 * 1000).toISOString();
    await updateUser(req.params.id, {
      is_suspended: true,
      suspend_reason: reason || 'Suspended by admin',
      suspension_end: suspensionEnd
    });
    res.json({ ok: true, suspensionEnd });
  } catch (e) {
    console.error('Suspend user error:', e);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// Error handling (production-safe)
app.use((err, req, res, next) => {
  // Log error without exposing sensitive data
  console.error('[Error]', {
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method,
  });

  // Handle specific database errors
  if (err.code === '23505') { // Unique violation
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (err.code === '23503') { // Foreign key violation
    return res.status(400).json({ error: 'Invalid reference to related resource' });
  }

  if (err.code === '23502') { // Not null violation
    return res.status(400).json({ error: 'Missing required field' });
  }

  // Production: Never expose stack traces or internal details
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    // Development: Include error details for debugging
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: err.stack
    });
  }
});

// Serve static files in production (must be after API routes)
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Start server
async function start() {
  try {
    await runMigrations();
    startCleanupInterval();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Capitol API listening on http://0.0.0.0:${PORT}`);
      console.log('Database: PostgreSQL (if configured)');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
  console.error('[UNHANDLED_REJECTION_STACK]', reason && reason.stack);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await shutdown();
  process.exit(0);
});

// Only start server if not running in Vercel
if (!process.env.VERCEL) {
  start();
}

export default app;
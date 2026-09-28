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
import { query, transaction, runMigrations, healthCheck, shutdown } from './database.js';
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
  ? (process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com'])
  : true; // Allow all origins in development

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
    // Set appropriate headers for images
    if (filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
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

function calcLevel(xp) {
  if (!xp || xp < 0) return 1;
  let l = 1;
  while (100 * l ** 1.4 <= xp) l++;
  return Math.max(1, l - 1);
}

// Centralized XP update
async function updateUserXP(client, userId, amount, reason = 'unknown') {
  const key = `xp_${reason}_${new Date().toISOString().slice(0, 10)}`;
  const updated = await client.query(
    `UPDATE users
     SET xp = GREATEST(0, xp + $1),
         xp_awarded_keys = COALESCE(xp_awarded_keys, '{}'::jsonb) || jsonb_build_object($2::text, to_jsonb($3::boolean))
     WHERE id = $4
     RETURNING xp`,
    [amount, key, true, userId]
  );
  const xp = updated.rows[0]?.xp ?? 0;
  const level = calcLevel(xp);
  await client.query(`UPDATE users SET level = $1 WHERE id = $2`, [level, userId]);
  return { xp, level, xp_awarded_keys: updated.rows[0]?.xp_awarded_keys };
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
    const result = await transaction(async (client) => {
      // Check if username exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      if (existingUser.rows.length > 0) {
        console.log('[Signup] Username already taken');
        throw Object.assign(new Error('Username already taken'), { status: 409 });
      }

      // Check if email exists
      const existingEmail = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [email.toLowerCase()]
      );
      if (existingEmail.rows.length > 0) {
        console.log('[Signup] Email already registered');
        throw Object.assign(new Error('Email already registered'), { status: 409 });
      }

      const id = uid();
      console.log('[Signup] Generating user ID', { id });
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();
      
      // Generate invite code - use timestamp + random to ensure uniqueness
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = crypto.randomBytes(3).toString('hex').toUpperCase();
      const invite = username.toUpperCase().slice(0, 4) + timestamp + random;
      
      const palette = ['#F5C800', '#A7D8DE', '#C4B5FD', '#F9A8D4', '#86EFAC', '#FDBA74'];
      let avatarHash = 0;
      for (const char of String(username).toLowerCase()) {
        avatarHash = (avatarHash * 31 + char.charCodeAt(0)) >>> 0;
      }

      console.log('[Signup] Inserting user into database');
      await client.query(
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
          id, username, email.toLowerCase(), displayName.trim(), passwordHash,
          JSON.stringify({ background: palette[avatarHash % palette.length], letter: username[0].toUpperCase() }),
          now, now,
          0, 1, 0, 0, 0, false, 'ok', false,
          0, 0, 0, now,
          0, 0, 'bronze', false,
          null, 0, 0, null,
          false, false,
          '', '', null, false,
          null, invite, 0, null,
          '[]', false, '{}'
        ]
      );

      console.log('[Signup] Creating session');
      // Create session within the same transaction
      const token = generateToken(id);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await client.query(
        `INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address, user_agent)
         VALUES ($1, $2, NOW(), $3, $4, $5)`,
        [token, id, expiresAt, req.ip, req.headers['user-agent']]
      );
      
      console.log('[Signup] Fetching created user');
      const userResult = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      console.log('[Signup] User created successfully', { id, username });
      return { token, user: selfUser(userResult.rows[0]) };
    });

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
    const result = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

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

    await query(
      'UPDATE users SET last_seen_at = NOW() WHERE id = $1',
      [user.id]
    );

    await query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address, user_agent)
       VALUES ($1, $2, NOW(), $3, $4, $5)`,
      [token, user.id, expiresAt, req.ip, req.headers['user-agent']]
    );

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
  const result = await query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
    [req.params.username]
  );
  res.json({ taken: result.rows.length > 0 });
});

app.get('/api/users', optionalAuth, async (req, res) => {
  const result = await query(
    'SELECT * FROM users WHERE is_banned = false ORDER BY created_at DESC LIMIT 100'
  );
  res.json({ users: result.rows.map(publicUser) });
});

app.get('/api/users/:id', optionalAuth, async (req, res) => {
  const result = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  const user = result.rows[0];
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
    'timezone', 'social_links', 'niche', 'age_range', 'safety_accepted'
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

  const updates = [];
  const values = [];
  let paramCount = 1;

  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = $${paramCount}`);
      values.push(body[key]);
      paramCount++;
    }
  }

  if (updates.length === 0) {
    return res.json({ user: selfUser(req.user) });
  }

  values.push(req.user.id);

  try {
    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    const result = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ user: selfUser(result.rows[0]) });
  } catch (e) {
    console.error('User update error:', e);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── Rooms ────────────────────────────────────────────────────────────────────
app.get('/api/rooms', optionalAuth, async (req, res) => {
  const result = await query(
    `SELECT r.*, 
     (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id AND rm.status = 'active') as member_count
     FROM rooms r 
     WHERE r.status = 'active'
     ORDER BY r.created_at DESC`
  );

  const rooms = result.rows.map(r => ({
    id: r.id,
    name: r.name,
    icon: r.icon || 'bolt',
    goal: r.goal || '',
    niche: r.niche || 'general',
    age_range: r.age_range || null,
    tags: r.tags || [],
    max_members: parseInt(r.max_members) || 8,
    member_count: Math.floor(parseInt(r.member_count) || 0),
    elite: !!r.elite,
    days: parseInt(r.days) || 30,
    created_at: r.created_at,
    creator_uid: r.creator_uid || null,
  }));

  res.json({ rooms });
});

app.get('/api/rooms/:id', optionalAuth, async (req, res) => {
  const result = await query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room = result.rows[0];

  // Check membership status
  let membership = 'none';
  if (req.user) {
    const memberResult = await query(
      `SELECT * FROM room_members 
       WHERE room_id = $1 AND user_id = $2 AND status = 'active'`,
      [room.id, req.user.id]
    );

    if (memberResult.rows.length > 0) {
      membership = 'active';
    }
  }

  const memberCountResult = await query(
    `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
    [room.id]
  );

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
      member_count: Math.floor(parseInt(memberCountResult.rows[0].count) || 0),
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
    const memberResult = await query(
      `SELECT rm.*, r.*, 
       (SELECT COUNT(*) FROM room_members rm2 WHERE rm2.room_id = rm.room_id AND rm2.status = 'active') as member_count
       FROM room_members rm
       JOIN rooms r ON rm.room_id = r.id
       WHERE rm.user_id = $1 AND rm.status = 'active'`,
      [req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.json({ room: null });
    }

    const member = memberResult.rows[0];
    res.json({
      room: {
        id: member.room_id,
        name: member.name,
        icon: member.icon || 'bolt',
        goal: member.goal || '',
        niche: member.niche || 'general',
        age_range: member.age_range || null,
        tags: member.tags || [],
        max_members: parseInt(member.max_members) || 8,
        member_count: Math.floor(parseInt(member.member_count) || 0),
        elite: !!member.elite,
        days: parseInt(member.days) || 30,
        created_at: member.created_at,
        creator_uid: member.creator_uid || null,
      },
      membership: {
        id: member.id,
        status: member.status,
        joined_at: member.joined_at
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
    const result = await transaction(async (client) => {
      const id = rid('room');
      const now = new Date().toISOString();

      // One active membership per user — leave any current rooms before creating
      await client.query(
        `UPDATE room_members SET status = 'left', left_at = NOW()
         WHERE user_id = $1 AND status = 'active'`,
        [req.user.id]
      );

      await client.query(
        `INSERT INTO rooms (id, name, icon, goal, niche, age_range, tags, max_members, elite, days, created_at, creator_uid, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')`,
        [id, name || 'Room', icon || 'bolt', goal || '', niche || 'general', ageRange || null,
         JSON.stringify(tags || []), maxMembers || 8, !!elite, days || 30, now, req.user.id]
      );

      // Add creator as first member
      const memberId = rid('rm');
      await client.query(
        `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
         VALUES ($1, $2, $3, 'active', $4)`,
        [memberId, id, req.user.id, now]
      );

      // Update user stats
      await client.query(
        `UPDATE users 
         SET room_joined_at = $1, joined_rooms = joined_rooms + 1 
         WHERE id = $2`,
        [now, req.user.id]
      );

      return { id };
    });

    const roomResult = await query('SELECT * FROM rooms WHERE id = $1', [result.id]);
    const memberCountResult = await query(
      `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
      [result.id]
    );

    res.json({
      room: {
        id: roomResult.rows[0].id,
        name: roomResult.rows[0].name,
        icon: roomResult.rows[0].icon || 'bolt',
        goal: roomResult.rows[0].goal || '',
        niche: roomResult.rows[0].niche || 'general',
        age_range: roomResult.rows[0].age_range || null,
        tags: roomResult.rows[0].tags || [],
        max_members: parseInt(roomResult.rows[0].max_members) || 8,
        member_count: Math.floor(parseInt(memberCountResult.rows[0].count) || 0),
        elite: !!roomResult.rows[0].elite,
        days: parseInt(roomResult.rows[0].days) || 30,
        created_at: roomResult.rows[0].created_at,
        creator_uid: roomResult.rows[0].creator_uid || null,
      }
    });
  } catch (e) {
    console.error('Room creation error:', e);
    res.status(500).json({ error: 'Room creation failed' });
  }
});

app.post('/api/rooms/:id/join', authenticate, async (req, res) => {
  try {
    await transaction(async (client) => {
      // Lock room row so capacity checks are race-safe under concurrent joins
      const roomResult = await client.query(
        'SELECT * FROM rooms WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      
      if (roomResult.rows.length === 0) {
        throw Object.assign(new Error('Room not found'), { status: 404 });
      }

      const room = roomResult.rows[0];

      // Check if user is already in this room with active status
      const currentActiveMember = await client.query(
        `SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2 AND status = 'active'`,
        [room.id, req.user.id]
      );

      if (currentActiveMember.rows.length > 0) {
        // User is already in this room - throw a special error to handle this case
        throw Object.assign(new Error('Already in room'), { status: 409, alreadyInRoom: true });
      }

      // Capacity applies to all non-active joins (including leave/kick rejoins)
      const memberCount = await client.query(
        `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
        [room.id]
      );

      if (parseInt(memberCount.rows[0].count) >= (room.max_members || 8)) {
        throw Object.assign(new Error('Room is full'), { status: 400 });
      }

      // One active membership per user
      await client.query(
        `UPDATE room_members SET status = 'left', left_at = NOW()
         WHERE user_id = $1 AND status = 'active' AND room_id <> $2`,
        [req.user.id, room.id]
      );

      // Upsert membership: rejoin after kick/leave, or insert new. Race-safe via ON CONFLICT.
      await client.query(
        `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
         VALUES ($1, $2, $3, 'active', $4)
         ON CONFLICT (room_id, user_id) DO UPDATE
         SET status = 'active', joined_at = EXCLUDED.joined_at, left_at = NULL`,
        [rid('rm'), room.id, req.user.id, new Date().toISOString()]
      );

      // Clear stale user-level kick flags so dashboard/onboarding stay consistent
      await client.query(
        `UPDATE users
         SET kicked_from_room = false, kick_status = 'ok', burned_at = NULL,
             room_joined_at = $1, joined_rooms = joined_rooms + 1
         WHERE id = $2`,
        [new Date().toISOString(), req.user.id]
      );
    });

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
    await transaction(async (client) => {
      const result = await client.query(
        `UPDATE room_members SET status = 'left', left_at = NOW() 
         WHERE room_id = $1 AND user_id = $2 AND status = 'active' RETURNING *`,
        [req.params.id, req.user.id]
      );

      // Only clear room_joined_at if the user was actually in this room
      if (result.rows.length > 0) {
        await client.query(
          `UPDATE users SET room_joined_at = NULL WHERE id = $1`,
          [req.user.id]
        );
      }

      // Check if room needs replacement
      const memberCount = await client.query(
        `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
        [req.params.id]
      );

      const configResult = await client.query("SELECT value FROM config WHERE key = 'system'");
      const config = configResult.rows[0]?.value || {};
      const minRoomSize = config.minRoomSize || 3;

      if (parseInt(memberCount.rows[0].count) > 0 && parseInt(memberCount.rows[0].count) < minRoomSize) {
        // Queue replacement
        const replacementId = rid('rep');
        await client.query(
          `INSERT INTO replacement_queue (id, room_id, status, created_at, attempts)
           VALUES ($1, $2, 'pending', NOW(), 0)`,
          [replacementId, req.params.id]
        );
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('Leave room error:', e);
    res.status(500).json({ error: 'Leave failed' });
  }
});

app.post('/api/rooms/:id/kick', authenticate, async (req, res) => {
  const { targetId, reason } = req.body || {};

  try {
    await transaction(async (client) => {
      const roomResult = await client.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
      
      if (roomResult.rows.length === 0) {
        throw Object.assign(new Error('Room not found'), { status: 404 });
      }

      const userResult = await client.query('SELECT * FROM users WHERE id = $1', [targetId]);
      
      if (userResult.rows.length === 0) {
        throw Object.assign(new Error('User not found'), { status: 404 });
      }

      // Update room member status to 'kicked'
      await client.query(
        `UPDATE room_members SET status = 'kicked', left_at = NOW() 
         WHERE room_id = $1 AND user_id = $2 AND status = 'active'`,
        [req.params.id, targetId]
      );

      // Clear target's active-room pointer so dashboard doesn't show a stale room
      await client.query(
        `UPDATE users SET room_joined_at = NULL WHERE id = $1`,
        [targetId]
      );

      // Manual kicks do not permanently block rejoin — room_members.status='kicked'
      // is cleared when the user joins again. Inactivity kicks still set user flags.
      if (reason === 'inactive') {
        const kickReason = 'inactive';
        await client.query(
          `UPDATE users 
           SET kicked_from_room = true, 
               kick_status = $1, 
               burned_at = NOW()
           WHERE id = $2`,
          [kickReason, targetId]
        );
      } else {
        // For manual kicks, clear any previous inactivity status since this is a different room/situation
        await client.query(
          `UPDATE users 
           SET kicked_from_room = false, 
               kick_status = 'ok',
               burned_at = NULL
           WHERE id = $1`,
          [targetId]
        );
      }

      // Apply XP penalty
      await updateUserXP(client, targetId, -20, 'kick_penalty');

      // Create notification
      const notifId = rid('notif');
      await client.query(
        `INSERT INTO notifications (id, user_id, type, read, created_at, data)
         VALUES ($1, $2, 'kick', false, NOW(), $3::jsonb)`,
        [notifId, targetId, JSON.stringify({
          reason: reason === 'inactive' ? 'Inactive for 3+ days' : 'Removed from room',
          roomId: req.params.id,
          roomName: roomResult.rows[0].name
        })]
      );

      // Check if room needs replacement
      const memberCount = await client.query(
        `SELECT COUNT(*) as count FROM room_members WHERE room_id = $1 AND status = 'active'`,
        [req.params.id]
      );

      const configResult = await client.query("SELECT value FROM config WHERE key = 'system'");
      const config = configResult.rows[0]?.value || {};
      const minRoomSize = config.minRoomSize || 3;

      if (parseInt(memberCount.rows[0].count) > 0 && parseInt(memberCount.rows[0].count) < minRoomSize) {
        const replacementId = rid('rep');
        await client.query(
          `INSERT INTO replacement_queue (id, room_id, status, created_at, attempts)
           VALUES ($1, $2, 'pending', NOW(), 0)`,
          [replacementId, req.params.id]
        );
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('Kick error:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Proofs ───────────────────────────────────────────────────────────────────
app.get('/api/proofs', optionalAuth, async (req, res) => {
  const { userId, limit = 50 } = req.query;
  
  let queryText = `
    SELECT p.*, u.display_name as user_name, u.photo_url as user_photo
    FROM proofs p
    LEFT JOIN users u ON p.user_id = u.id
  `;
  const params = [];

  if (userId) {
    queryText += ' WHERE p.user_id = $1';
    params.push(userId);
  }

  queryText += ' ORDER BY p.created_at DESC LIMIT $' + (params.length + 1);
  params.push(parseInt(limit));

  const result = await query(queryText, params);
  
  const proofs = result.rows.map(p => ({
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
    const result = await transaction(async (client) => {
      const today = new Date().toISOString().slice(0, 10);
      const userId = req.user.id;

      // Check for duplicate proof today
      const existingProof = await client.query(
        `SELECT * FROM proofs WHERE user_id = $1 AND date_key = $2`,
        [userId, today]
      );

      if (existingProof.rows.length > 0) {
        return { 
          proof: existingProof.rows[0], 
          stats: { xp: req.user.xp, level: req.user.level, streak: req.user.streak, xpGained: 0 }, 
          duplicate: true 
        };
      }

      // Calculate streak
      const proofDates = await client.query(
        `SELECT date_key FROM proofs WHERE user_id = $1 AND ai_verdict = 'approved' ORDER BY date_key`,
        [userId]
      );

      const dates = new Set(proofDates.rows.map(p => p.date_key));
      dates.add(today);
      
      let newStreak = 0;
      const cursor = new Date(`${today}T00:00:00Z`);
      while (dates.has(cursor.toISOString().slice(0, 10))) {
        newStreak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }

      const xpGain = 10 + Math.min(newStreak, 30) * 2;
      const proofId = rid('proof');

      // Insert proof
      await client.query(
        `INSERT INTO proofs (id, user_id, date_key, created_at, image_url, link, note, streak, xp_earned, ai_verdict, room_id, votes, gesture)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, 'approved', $9, '{}', $10)`,
        [proofId, userId, today, imageUrl || null, link || '', note || '', newStreak, xpGain, roomId || null, gesture || null]
      );

      // Update user stats
      await client.query(
        `UPDATE users 
         SET streak = $1, 
             best_streak = GREATEST(best_streak, $1),
             last_submit_date = $2,
             proofs_count = proofs_count + 1,
             missed_days = 0,
             warned = false
         WHERE id = $3`,
        [newStreak, today, userId]
      );

      // Update XP
      await updateUserXP(client, userId, xpGain, 'proof');

      // Update streaks table
      await client.query(
        `INSERT INTO streaks (user_id, current_streak, best_streak, last_qualifying_date, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           current_streak = $2,
           best_streak = GREATEST(streaks.best_streak, $3),
           last_qualifying_date = $4,
           updated_at = NOW()`,
        [userId, newStreak, newStreak, today]
      );

      // Check achievements
      const milestones = [
        [1, 'First Day', 'Completed your first qualifying proof.'],
        [3, 'Early Momentum', 'Maintained a 3 day streak.'],
        [7, 'Weekly Consistency', 'Maintained a 7 day streak.'],
        [13, 'Elite Consistency', 'Maintained a 13 day streak.'],
      ];

      for (const [days, name, description] of milestones) {
        if (newStreak >= days) {
          await client.query(
            `INSERT INTO user_achievements (id, user_id, achievement_days, unlocked_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, achievement_days) DO NOTHING`,
            [rid('ua'), userId, days]
          );
        }
      }

      // Get updated user
      const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];

      return {
        proof: { id: proofId, user_id: userId, date_key: today, created_at: new Date().toISOString() },
        stats: { xp: user.xp, level: user.level, streak: user.streak, xpGained: xpGain }
      };
    });

    res.json(result);
  } catch (e) {
    console.error('Proof submission error:', e);
    res.status(500).json({ error: 'Proof submission failed' });
  }
});

// ── Notifications ────────────────────────────────────────────────────────────
app.get('/api/notifications', authenticate, async (req, res) => {
  const result = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );

  const notifications = result.rows.map(n => ({
    id: n.id,
    type: n.type,
    read: !!n.read,
    created_at: n.created_at,
    data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data,
  }));

  res.json({ notifications });
});

app.post('/api/notifications', authenticate, async (req, res) => {
  const { userId, type, data, eventKey } = req.body || {};

  try {
    // Check for duplicate
    if (eventKey) {
      const existing = await query(
        `SELECT * FROM notifications WHERE user_id = $1 AND data::text LIKE $2`,
        [userId, `%${eventKey}%`]
      );
      if (existing.rows.length > 0) {
        return res.json({ notification: existing.rows[0], duplicate: true });
      }
    }

    const id = rid('notif');
    await query(
      `INSERT INTO notifications (id, user_id, type, read, created_at, data)
       VALUES ($1, $2, $3, false, NOW(), $4)`,
      [id, userId, type || 'info', JSON.stringify({ ...(data || {}), ...(eventKey ? { eventKey } : {}), fromUid: req.user.id })]
    );

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

  await query(
    `UPDATE notifications SET read = true WHERE id = ANY($1) AND user_id = $2`,
    [ids, req.user.id]
  );

  res.json({ ok: true });
});

// ── Leaderboard ──────────────────────────────────────────────────────────────
app.get('/api/leaderboard', optionalAuth, async (req, res) => {
  const result = await query(
    `SELECT * FROM users WHERE is_banned = false ORDER BY xp DESC LIMIT 200`
  );
  res.json({ leaderboard: result.rows.map(publicUser) });
});

// ── Economy ──────────────────────────────────────────────────────────────────
app.post('/api/economy/xp', authenticate, async (req, res) => {
  const { amount, reason } = req.body || {};
  const xpAmount = Number(amount || 0);

  try {
    await transaction(async (client) => {
      await updateUserXP(client, req.user.id, xpAmount, reason || 'manual');
    });

    const userResult = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];

    res.json({ ok: true, xpGained: xpAmount, xp: user.xp, level: user.level });
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
    await transaction(async (client) => {
      // Remove existing entry
      await client.query('DELETE FROM waiting_queue WHERE user_id = $1', [req.user.id]);

      const id = rid('wait');
      await client.query(
        `INSERT INTO waiting_queue (id, user_id, niche, age_range, joined_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, req.user.id, niche || req.user.niche || '', ageRange || req.user.age_range || '']
      );

      // Try immediate match
      const availableRooms = await client.query(
        `SELECT r.*, 
         (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id AND rm.status = 'active') as member_count
         FROM rooms r 
         WHERE r.status = 'active' 
         AND r.niche = $1 
         AND (r.age_range IS NULL OR r.age_range = $2)
         ORDER BY r.created_at ASC
         LIMIT 5`,
        [niche || req.user.niche || 'general', ageRange || req.user.age_range || '']
      );

      for (const room of availableRooms.rows) {
        if (parseInt(room.member_count) < (room.max_members || 8)) {
          // Join this room immediately
          await client.query(
            `UPDATE room_members SET status = 'left', left_at = NOW() 
             WHERE user_id = $1 AND status = 'active'`,
            [req.user.id]
          );

          const memberId = rid('rm');
          await client.query(
            `INSERT INTO room_members (id, room_id, user_id, status, joined_at)
             VALUES ($1, $2, $3, 'active', NOW())`,
            [memberId, room.id, req.user.id]
          );

          await client.query(
            `UPDATE users SET room_joined_at = NOW(), joined_rooms = joined_rooms + 1 WHERE id = $1`,
            [req.user.id]
          );

          await client.query('DELETE FROM waiting_queue WHERE id = $1', [id]);

          return res.json({ ok: true, queued: false, matched: true, roomId: room.id });
        }
      }
    });

    res.json({ ok: true, queued: true });
  } catch (e) {
    console.error('Waiting queue error:', e);
    res.status(500).json({ error: 'Waiting queue failed' });
  }
});

app.delete('/api/waiting-queue/leave', authenticate, async (req, res) => {
  await query('DELETE FROM waiting_queue WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

app.get('/api/waiting-queue/status', authenticate, async (req, res) => {
  const result = await query('SELECT * FROM waiting_queue WHERE user_id = $1', [req.user.id]);
  const queueSize = await query('SELECT COUNT(*) as count FROM waiting_queue');
  
  res.json({
    inQueue: result.rows.length > 0,
    entry: result.rows[0] || null,
    queueSize: parseInt(queueSize.rows[0].count) || 0
  });
});

// ── Referrals ───────────────────────────────────────────────────────────────
app.get('/api/referrals/code/:code', async (req, res) => {
  const result = await query(
    "SELECT * FROM users WHERE UPPER(invite_code) = UPPER($1)",
    [req.params.code]
  );
  
  if (result.rows.length === 0) {
    return res.json({ inviter: null });
  }

  res.json({ inviter: publicUser(result.rows[0]) });
});

app.post('/api/referrals/process', authenticate, async (req, res) => {
  const { inviterId } = req.body || {};

  try {
    await transaction(async (client) => {
      if (inviterId === req.user.id) {
        return res.json({ ok: false });
      }

      await client.query(
        `UPDATE users SET invites_count = invites_count + 1 WHERE id = $1`,
        [inviterId]
      );

      await updateUserXP(client, inviterId, 50, 'referral');
    });

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
    await transaction(async (client) => {
      if (targetId === req.user.id) {
        return res.status(400).json({ error: 'Cannot follow self' });
      }

      await client.query(
        `INSERT INTO follows (from_user_id, to_user_id, at) VALUES ($1, $2, NOW())
         ON CONFLICT (from_user_id, to_user_id) DO NOTHING`,
        [req.user.id, targetId]
      );

      // Update user's following list
      const targetResult = await client.query('SELECT * FROM users WHERE id = $1', [targetId]);
      const target = targetResult.rows[0];
      
      const init = (target.username || '?').slice(0, 2).toUpperCase();
      await client.query(
        `UPDATE users SET following = array_append(following, $1) WHERE id = $2 AND NOT ($1 = ANY(following))`,
        [init, req.user.id]
      );

      // Create notification
      const notifId = rid('notif');
      await client.query(
        `INSERT INTO notifications (id, user_id, type, read, created_at, data)
         VALUES ($1, $2, 'follow', false, NOW(), $3)`,
        [notifId, targetId, JSON.stringify({
          fromUid: req.user.id,
          fromName: req.user.display_name,
          fromUsername: req.user.username
        })]
      );
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
    await query('DELETE FROM follows WHERE from_user_id = $1 AND to_user_id = $2', [req.user.id, targetId]);
    
    const targetResult = await client.query('SELECT * FROM users WHERE id = $1', [targetId]);
    const target = targetResult.rows[0];
    const init = (target.username || '?').slice(0, 2).toUpperCase();
    
    await query(
      `UPDATE users SET following = array_remove(following, $1) WHERE id = $2`,
      [init, req.user.id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('Unfollow error:', e);
    res.status(500).json({ error: 'Unfollow failed' });
  }
});

// ── Close Friends ─────────────────────────────────────────────────────────────
app.get('/api/close-friends', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM close_friends 
       WHERE a = $1 OR b = $1`,
      [req.user.id]
    );
    
    const friendIds = result.rows.map(f => f.a === req.user.id ? f.b : f.a);
    
    if (friendIds.length === 0) {
      return res.json({ friends: [] });
    }
    
    const usersResult = await query(
      `SELECT * FROM users WHERE id = ANY($1)`,
      [friendIds]
    );
    
    res.json({ friends: usersResult.rows.map(publicUser) });
  } catch (e) {
    console.error('Get close friends error:', e);
    res.status(500).json({ error: 'Failed to get close friends' });
  }
});

app.get('/api/close-friends/requests', authenticate, async (req, res) => {
  try {
    const sentResult = await query(
      `SELECT * FROM close_friend_requests WHERE from_user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    
    const receivedResult = await query(
      `SELECT * FROM close_friend_requests WHERE to_user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    
    res.json({ sent: sentResult.rows, received: receivedResult.rows });
  } catch (e) {
    console.error('Get friend requests error:', e);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

app.post('/api/close-friends/request', authenticate, async (req, res) => {
  const { targetId } = req.body || {};
  
  try {
    await transaction(async (client) => {
      if (targetId === req.user.id) {
        throw Object.assign(new Error('Cannot friend self'), { status: 400 });
      }
      
      const requestId = rid('cfr');
      await client.query(
        `INSERT INTO close_friend_requests (id, from_user_id, to_user_id, status, created_at)
         VALUES ($1, $2, $3, 'pending', NOW())`,
        [requestId, req.user.id, targetId]
      );
      
      const notifId = rid('notif');
      await client.query(
        `INSERT INTO notifications (id, user_id, type, read, created_at, data)
         VALUES ($1, $2, 'friend_request', false, NOW(), $3)`,
        [notifId, targetId, JSON.stringify({
          requestId,
          fromUid: req.user.id,
          fromName: req.user.display_name,
          fromUsername: req.user.username
        })]
      );
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
    await transaction(async (client) => {
      const requestResult = await client.query(
        `SELECT * FROM close_friend_requests WHERE id = $1 AND to_user_id = $2`,
        [requestId, req.user.id]
      );
      
      if (requestResult.rows.length === 0) {
        throw Object.assign(new Error('Request not found'), { status: 404 });
      }
      
      const request = requestResult.rows[0];
      
      await client.query(
        `UPDATE close_friend_requests SET status = $1 WHERE id = $2`,
        [accept ? 'accepted' : 'declined', requestId]
      );
      
      if (accept) {
        const friendId = rid('cf');
        await client.query(
          `INSERT INTO close_friends (id, a, b, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [friendId, request.from_user_id, request.to_user_id]
        );
      }
    });
    
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
    await query(
      `DELETE FROM close_friends 
       WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)`,
      [req.user.id, friendId]
    );
    
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
    await transaction(async (client) => {
      if (isNaN(n) || n < 1) {
        throw Object.assign(new Error('Invalid days'), { status: 400 });
      }
      
      if (!reason || reason.trim().length < 10) {
        throw Object.assign(new Error('Reason too short'), { status: 400 });
      }
      
      const userResult = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const user = userResult.rows[0];
      
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
      
      await updateUserXP(client, req.user.id, -xpCost, 'grace');
      
      await client.query(
        `UPDATE users 
         SET grace_active = true, 
             grace_start_date = NOW(),
             grace_days_total = $1,
             grace_used_this_month = $2,
             grace_last_month = $3,
             kick_status = 'ok',
             warned = false,
             missed_days = 0,
             streak = $4
         WHERE id = $5`,
        [n, effectiveUsed + 1, thisMonth, currentStreak, req.user.id]
      );
      
      res.json({ ok: true, days: n, xpCost, streak: currentStreak });
    });
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
    await transaction(async (client) => {
      const configResult = await client.query("SELECT value FROM config WHERE key = 'system'");
      const config = configResult.rows[0]?.value || {};
      const inactivityThresholdDays = config.inactivityThresholdDays || 3;
      
      // Get all active room members
      const membersResult = await client.query(
        `SELECT rm.*, u.username, u.display_name, u.last_submit_date, u.missed_days, u.kick_status
         FROM room_members rm
         JOIN users u ON rm.user_id = u.id
         WHERE rm.status = 'active'`
      );
      
      const today = new Date();
      const warningsIssued = [];
      const kicksIssued = [];
      
      for (const member of membersResult.rows) {
        const lastSubmitDate = member.last_submit_date ? new Date(member.last_submit_date) : null;
        const daysSince = lastSubmitDate ? Math.floor((today - lastSubmitDate) / (1000 * 60 * 60 * 24)) : 999;
        
        if (daysSince >= inactivityThresholdDays) {
          // 3+ days missed - kick the user
          await client.query(
            `UPDATE room_members SET status = 'kicked', left_at = NOW(), inactive_since = NOW(), inactive_reason = 'No proof for 3+ days'
             WHERE id = $1`,
            [member.id]
          );
          
          await client.query(
            `UPDATE users SET kicked_from_room = true, kick_status = 'inactive', burned_at = NOW(), missed_days = 3
             WHERE id = $1`,
            [member.user_id]
          );
          
          // Apply XP penalty
          await updateUserXP(client, member.user_id, -20, 'inactive_kick');
          
          // Create notification
          const notifId = rid('notif');
          await client.query(
            `INSERT INTO notifications (id, user_id, type, read, created_at, data)
             VALUES ($1, $2, 'kick', false, NOW(), $3)`,
            [notifId, member.user_id, JSON.stringify({
              reason: 'Inactive for 3+ days',
              roomId: member.room_id
            })]
          );
          
          kicksIssued.push({ userId: member.user_id, username: member.username, daysSince });
        } else if (daysSince === 2) {
          // 2 days missed - issue warning
          if (member.kick_status !== 'warned') {
            await client.query(
              `UPDATE users SET kick_status = 'warned', missed_days = 2 WHERE id = $1`,
              [member.user_id]
            );
            
            // Create warning notification
            const notifId = rid('notif');
            await client.query(
              `INSERT INTO notifications (id, user_id, type, read, created_at, data)
               VALUES ($1, $2, 'kick', false, NOW(), $3)`,
              [notifId, member.user_id, JSON.stringify({
                reason: 'Warning: 2 days missed. Submit proof today to avoid removal.',
                roomId: member.room_id
              })]
            );
            
            warningsIssued.push({ userId: member.user_id, username: member.username, daysSince });
          }
        } else if (daysSince === 1) {
          // 1 day missed - flag user
          if (member.kick_status === 'ok') {
            await client.query(
              `UPDATE users SET kick_status = 'flagged', missed_days = 1 WHERE id = $1`,
              [member.user_id]
            );
          }
        }
      }
      
      res.json({ 
        ok: true, 
        checked: membersResult.rows.length,
        warningsIssued,
        kicksIssued
      });
    });
  } catch (e) {
    console.error('Inactivity check error:', e);
    res.status(500).json({ error: 'Inactivity check failed' });
  }
});

// ── Freeze Tokens ─────────────────────────────────────────────────────────────
app.get('/api/economy/freeze-tokens', authenticate, async (req, res) => {
  const result = await query(
    `SELECT * FROM freeze_tokens WHERE user_id = $1 AND used = false ORDER BY bought_at DESC`,
    [req.user.id]
  );
  res.json({ tokens: result.rows });
});

app.post('/api/economy/buy-freeze', authenticate, async (req, res) => {
  try {
    await transaction(async (client) => {
      const userResult = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const user = userResult.rows[0];
      const cost = 100;

      if ((user.xp || 0) < cost) {
        throw Object.assign(new Error('Not enough XP'), { status: 400 });
      }

      await updateUserXP(client, req.user.id, -cost, 'freeze_token');

      const tokenId = rid('ft');
      await client.query(
        `INSERT INTO freeze_tokens (id, user_id, used, bought_at) VALUES ($1, $2, false, NOW())`,
        [tokenId, req.user.id]
      );
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/economy/use-freeze', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM freeze_tokens WHERE user_id = $1 AND used = false ORDER BY bought_at ASC LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No tokens available' });
    }

    await query(
      `UPDATE freeze_tokens SET used = true WHERE id = $1`,
      [result.rows[0].id]
    );

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
  const result = await query("SELECT value FROM config WHERE key = 'system'");
  res.json({ config: result.rows[0]?.value || {} });
});

app.patch('/api/admin/config', authenticate, requireAdmin, async (req, res) => {
  const { inactivityThresholdDays, minRoomSize, maxRoomSize } = req.body || {};

  try {
    const currentResult = await query("SELECT value FROM config WHERE key = 'system'");
    const currentConfig = currentResult.rows[0]?.value || {};
    
    const newConfig = {
      ...currentConfig,
      ...(inactivityThresholdDays !== undefined && { inactivityThresholdDays }),
      ...(minRoomSize !== undefined && { minRoomSize }),
      ...(maxRoomSize !== undefined && { maxRoomSize }),
    };

    await query(
      `UPDATE config SET value = $1 WHERE key = 'system'`,
      [JSON.stringify(newConfig)]
    );

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
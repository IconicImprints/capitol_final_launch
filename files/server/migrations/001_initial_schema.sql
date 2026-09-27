-- Capitol PostgreSQL Schema
-- Migration: 001_initial_schema
-- Description: Initial database schema for Capitol production backend

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  photo_url TEXT,
  avatar_config JSONB,
  banner_url TEXT,
  bio TEXT,
  pronouns TEXT,
  timezone TEXT DEFAULT 'UTC',
  social_links JSONB DEFAULT '{}',
  is_admin BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  is_suspended BOOLEAN DEFAULT FALSE,
  suspension_end TIMESTAMP WITH TIME ZONE,
  suspend_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  missed_days INTEGER DEFAULT 0,
  warned BOOLEAN DEFAULT FALSE,
  kick_status TEXT DEFAULT 'ok',
  kicked_from_room BOOLEAN DEFAULT FALSE,
  proofs_count INTEGER DEFAULT 0,
  completed_rooms INTEGER DEFAULT 0,
  joined_rooms INTEGER DEFAULT 0,
  join_timestamp TIMESTAMP WITH TIME ZONE,
  consistency_score INTEGER DEFAULT 0,
  near_miss_count INTEGER DEFAULT 0,
  league TEXT DEFAULT 'bronze',
  grace_active BOOLEAN DEFAULT FALSE,
  grace_start_date TIMESTAMP WITH TIME ZONE,
  grace_days_total INTEGER DEFAULT 0,
  total_grace_used INTEGER DEFAULT 0,
  last_submit_date DATE,
  vulture_claimed TIMESTAMP WITH TIME ZONE,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_questions_complete BOOLEAN DEFAULT FALSE,
  niche TEXT DEFAULT '',
  age_range TEXT DEFAULT '',
  room_joined_at TIMESTAMP WITH TIME ZONE,
  onboard_bonus_awarded BOOLEAN DEFAULT FALSE,
  safety_accepted TIMESTAMP WITH TIME ZONE,
  invite_code TEXT UNIQUE,
  invites_count INTEGER DEFAULT 0,
  burned_at TIMESTAMP WITH TIME ZONE,
  following JSONB DEFAULT '[]',
  premium BOOLEAN DEFAULT FALSE,
  xp_awarded_keys JSONB DEFAULT '{}',
  CONSTRAINT valid_age_range CHECK (age_range IN ('', '13_17', '18_22', '23_29', '30_39', '40_')),
  CONSTRAINT valid_league CHECK (league IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
  CONSTRAINT valid_kick_status CHECK (kick_status IN ('ok', 'warned', 'flagged', 'kicked', 'inactive'))
);

-- Sessions table (JWT token blacklist/validation)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'bolt',
  goal TEXT,
  niche TEXT DEFAULT 'general',
  age_range TEXT,
  tags JSONB DEFAULT '[]',
  max_members INTEGER DEFAULT 8,
  elite BOOLEAN DEFAULT FALSE,
  days INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  creator_uid TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  CONSTRAINT valid_room_status CHECK (status IN ('active', 'archived', 'full')),
  CONSTRAINT valid_room_size CHECK (max_members BETWEEN 3 AND 8)
);

-- Room members table
CREATE TABLE IF NOT EXISTS room_members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  inactive_since TIMESTAMP WITH TIME ZONE,
  inactive_reason TEXT,
  replacement BOOLEAN DEFAULT FALSE,
  UNIQUE(room_id, user_id),
  CONSTRAINT valid_member_status CHECK (status IN ('active', 'left', 'kicked', 'inactive_kicked'))
);

-- Proofs table
CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_key DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  image_url TEXT,
  link TEXT,
  note TEXT,
  streak INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  ai_verdict TEXT DEFAULT 'approved',
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  votes JSONB DEFAULT '{}',
  gesture TEXT,
  CONSTRAINT valid_ai_verdict CHECK (ai_verdict IN ('approved', 'rejected', 'pending', 'flagged'))
);

-- Streaks table
CREATE TABLE IF NOT EXISTS streaks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_qualifying_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
  days INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);

-- User achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_days INTEGER NOT NULL REFERENCES achievements(days) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_days)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data JSONB DEFAULT '{}',
  CONSTRAINT valid_notification_type CHECK (type IN ('info', 'proof', 'kick', 'challenge', 'follow', 'friend_request', 'room_joined', 'new_member'))
);

-- Follows table
CREATE TABLE IF NOT EXISTS follows (
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY(from_user_id, to_user_id),
  CONSTRAINT no_self_follow CHECK (from_user_id != to_user_id)
);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  from_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_days INTEGER DEFAULT 7,
  stakes INTEGER DEFAULT 0,
  message TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_challenge_status CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'failed'))
);

-- Close friends table
CREATE TABLE IF NOT EXISTS close_friends (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(a, b),
  CONSTRAINT no_self_friend CHECK (a != b)
);

-- Close friend requests table
CREATE TABLE IF NOT EXISTS close_friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_request_status CHECK (status IN ('pending', 'accepted', 'declined'))
);

-- Freeze tokens table
CREATE TABLE IF NOT EXISTS freeze_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used BOOLEAN DEFAULT FALSE,
  bought_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waiting queue table
CREATE TABLE IF NOT EXISTS waiting_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  niche TEXT DEFAULT '',
  age_range TEXT DEFAULT '',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Replacement queue table
CREATE TABLE IF NOT EXISTS replacement_queue (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  error TEXT,
  reason TEXT,
  candidate_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT valid_replacement_status CHECK (status IN ('pending', 'completed', 'failed'))
);

-- Config table (single row for system config)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Activity log table (for XP/streak tracking)
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  xp_change INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_action_type CHECK (action_type IN ('proof', 'referral', 'kick_penalty', 'freeze_token', 'manual', 'streak_bonus'))
);

-- Insert default config
INSERT INTO config (key, value) VALUES 
('system', '{"inactivityThresholdDays": 3, "minRoomSize": 3, "maxRoomSize": 8, "lastActivityCheck": null}')
ON CONFLICT (key) DO NOTHING;

-- Insert default achievements
INSERT INTO achievements (days, name, description) VALUES
(1, 'First Day', 'Completed your first qualifying proof.'),
(3, 'Early Momentum', 'Maintained a 3 day streak.'),
(7, 'Weekly Consistency', 'Maintained a 7 day streak.'),
(13, 'Elite Consistency', 'Maintained a 13 day streak.'),
(30, 'Monthly Master', 'Maintained a 30 day streak.')
ON CONFLICT (days) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_status ON room_members(status);
CREATE INDEX IF NOT EXISTS idx_room_members_joined_at ON room_members(joined_at);

CREATE INDEX IF NOT EXISTS idx_proofs_user_id ON proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_date_key ON proofs(date_key);
CREATE INDEX IF NOT EXISTS idx_proofs_room_id ON proofs(room_id);
CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waiting_queue_user_id ON waiting_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_waiting_queue_niche ON waiting_queue(niche);
CREATE INDEX IF NOT EXISTS idx_waiting_queue_age_range ON waiting_queue(age_range);

CREATE INDEX IF NOT EXISTS idx_replacement_queue_room_id ON replacement_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_replacement_queue_status ON replacement_queue(status);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
CREATE INDEX IF NOT EXISTS idx_users_niche ON users(niche);
CREATE INDEX IF NOT EXISTS idx_users_age_range ON users(age_range);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_league ON users(league);

CREATE INDEX IF NOT EXISTS idx_rooms_niche ON rooms(niche);
CREATE INDEX IF NOT EXISTS idx_rooms_age_range ON rooms(age_range);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action_type ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_from_user ON follows(from_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_to_user ON follows(to_user_id);
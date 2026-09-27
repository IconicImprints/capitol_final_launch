-- Capitol Supabase Database Schema
-- This migration creates tables to replace the JSON file persistence
-- All tables use JSONB for flexible data matching the existing structure

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
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
  -- XP tracking fields to prevent duplicate awards
  xp_awarded_keys JSONB DEFAULT '{}'
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  creator_uid TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Room members table
CREATE TABLE IF NOT EXISTS room_members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active', -- active, left, kicked, inactive_kicked
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  inactive_since TIMESTAMP WITH TIME ZONE,
  inactive_reason TEXT,
  replacement BOOLEAN DEFAULT FALSE,
  UNIQUE(room_id, user_id)
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
  gesture TEXT
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
  data JSONB DEFAULT '{}'
);

-- Follows table
CREATE TABLE IF NOT EXISTS follows (
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY(from_user_id, to_user_id)
);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  from_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_days INTEGER DEFAULT 7,
  stakes INTEGER DEFAULT 0,
  message TEXT,
  status TEXT DEFAULT 'pending', -- pending, accepted, declined
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Close friends table
CREATE TABLE IF NOT EXISTS close_friends (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(a, b)
);

-- Close friend requests table
CREATE TABLE IF NOT EXISTS close_friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- pending, accepted, declined
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  status TEXT DEFAULT 'pending', -- pending, completed, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  error TEXT,
  reason TEXT,
  candidate_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Config table (single row for system config)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
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
(13, 'Elite Consistency', 'Maintained a 13 day streak.')
ON CONFLICT (days) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_status ON room_members(status);
CREATE INDEX IF NOT EXISTS idx_proofs_user_id ON proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_date_key ON proofs(date_key);
CREATE INDEX IF NOT EXISTS idx_proofs_room_id ON proofs(room_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_waiting_queue_user_id ON waiting_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_replacement_queue_room_id ON replacement_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_replacement_queue_status ON replacement_queue(status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);

-- Capitol Complete Supabase Schema
-- This replaces the entire PostgreSQL backend with Supabase
-- Includes all tables from the existing schema plus moderation system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS & AUTH
-- ============================================================================

-- Users table (integrated with Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Will reference auth.users.id
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
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
  grace_used_this_month INTEGER DEFAULT 0,
  grace_last_month TEXT DEFAULT '',
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

-- Sessions table (for custom JWT - will be phased out in favor of Supabase Auth)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

-- ============================================================================
-- ROOMS
-- ============================================================================

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

-- ============================================================================
-- PROOFS & STREAKS
-- ============================================================================

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

CREATE TABLE IF NOT EXISTS streaks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_qualifying_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- ACHIEVEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS achievements (
  days INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_days INTEGER NOT NULL REFERENCES achievements(days) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_days)
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data JSONB DEFAULT '{}',
  CONSTRAINT valid_notification_type CHECK (type IN ('info', 'proof', 'kick', 'challenge', 'follow', 'friend_request', 'room_joined', 'new_member'))
);

-- ============================================================================
-- SOCIAL (FOLLOWS, FRIENDS, CHALLENGES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS follows (
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY(from_user_id, to_user_id),
  CONSTRAINT no_self_follow CHECK (from_user_id != to_user_id)
);

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

CREATE TABLE IF NOT EXISTS close_friends (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(a, b),
  CONSTRAINT no_self_friend CHECK (a != b)
);

CREATE TABLE IF NOT EXISTS close_friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_request_status CHECK (status IN ('pending', 'accepted', 'declined'))
);

-- ============================================================================
-- ECONOMY (FREEZE TOKENS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS freeze_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used BOOLEAN DEFAULT FALSE,
  bought_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- QUEUES (WAITING & REPLACEMENT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS waiting_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  niche TEXT DEFAULT '',
  age_range TEXT DEFAULT '',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- ============================================================================
-- CONFIG & ACTIVITY LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  xp_change INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_action_type CHECK (action_type IN ('proof', 'referral', 'kick_penalty', 'freeze_token', 'manual', 'streak_bonus'))
);

-- ============================================================================
-- MODERATION SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS moderation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT,
  content_type TEXT NOT NULL,
  violation_category TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 5),
  action_taken TEXT NOT NULL,
  detection_reason TEXT NOT NULL,
  content_sample TEXT,
  automated BOOLEAN DEFAULT true,
  reviewed_by_admin TEXT REFERENCES users(id),
  is_false_positive BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_content_type CHECK (content_type IN ('room_message', 'team_mission', 'username', 'display_name', 'bio', 'profile', 'other')),
  CONSTRAINT valid_action_taken CHECK (action_taken IN ('allowed', 'removed', 'warning', 'restriction', 'suspension', 'ban'))
);

CREATE TABLE IF NOT EXISTS prohibited_terms (
  id TEXT PRIMARY KEY,
  term TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT true,
  requires_context BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_term_category CHECK (category IN ('racial_slur', 'hate_speech', 'harassment', 'discriminatory', 'severe'))
);

CREATE TABLE IF NOT EXISTS user_strikes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  reason TEXT NOT NULL,
  related_event_id TEXT REFERENCES moderation_events(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

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

-- Insert default moderation configuration
INSERT INTO moderation_config (key, value) VALUES 
('thresholds', jsonb_build_object(
  'level_2_warning_count', 1,
  'level_3_restriction_count', 2,
  'level_4_suspension_count', 3,
  'level_5_ban_count', 5,
  'suspension_duration_hours', 24,
  'strike_expiry_days', 30
)),
('severity_mappings', jsonb_build_object(
  'profanity_mild', 1,
  'profanity_targeted', 2,
  'racial_slur', 3,
  'hate_speech', 3,
  'harassment', 2,
  'discriminatory', 3,
  'severe_abuse', 4,
  'persistent_violation', 5
))
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
CREATE INDEX IF NOT EXISTS idx_users_niche ON users(niche);
CREATE INDEX IF NOT EXISTS idx_users_age_range ON users(age_range);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_league ON users(league);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);

-- Rooms
CREATE INDEX IF NOT EXISTS idx_rooms_niche ON rooms(niche);
CREATE INDEX IF NOT EXISTS idx_rooms_age_range ON rooms(age_range);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_creator_uid ON rooms(creator_uid);

-- Room Members
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_status ON room_members(status);
CREATE INDEX IF NOT EXISTS idx_room_members_joined_at ON room_members(joined_at);

-- Proofs
CREATE INDEX IF NOT EXISTS idx_proofs_user_id ON proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_date_key ON proofs(date_key);
CREATE INDEX IF NOT EXISTS idx_proofs_room_id ON proofs(room_id);
CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at DESC);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Social
CREATE INDEX IF NOT EXISTS idx_follows_from_user ON follows(from_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_to_user ON follows(to_user_id);

-- Queues
CREATE INDEX IF NOT EXISTS idx_waiting_queue_user_id ON waiting_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_waiting_queue_niche ON waiting_queue(niche);
CREATE INDEX IF NOT EXISTS idx_waiting_queue_age_range ON waiting_queue(age_range);
CREATE INDEX IF NOT EXISTS idx_replacement_queue_room_id ON replacement_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_replacement_queue_status ON replacement_queue(status);

-- Activity Log
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action_type ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Moderation
CREATE INDEX IF NOT EXISTS idx_moderation_events_user_id ON moderation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_events_content_id ON moderation_events(content_id);
CREATE INDEX IF NOT EXISTS idx_moderation_events_severity ON moderation_events(severity);
CREATE INDEX IF NOT EXISTS idx_moderation_events_created_at ON moderation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_events_automated ON moderation_events(automated);
CREATE INDEX IF NOT EXISTS idx_moderation_events_false_positive ON moderation_events(is_false_positive);

CREATE INDEX IF NOT EXISTS idx_prohibited_terms_category ON prohibited_terms(category);
CREATE INDEX IF NOT EXISTS idx_prohibited_terms_active ON prohibited_terms(is_active);
CREATE INDEX IF NOT EXISTS idx_prohibited_terms_severity ON prohibited_terms(severity);

CREATE INDEX IF NOT EXISTS idx_user_strikes_user_id ON user_strikes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_strikes_severity ON user_strikes(severity);
CREATE INDEX IF NOT EXISTS idx_user_strikes_active ON user_strikes(is_active);
CREATE INDEX IF NOT EXISTS idx_user_strikes_expires_at ON user_strikes(expires_at);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_moderation_events_updated_at BEFORE UPDATE ON moderation_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prohibited_terms_updated_at BEFORE UPDATE ON prohibited_terms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_streaks_updated_at BEFORE UPDATE ON streaks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE freeze_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE replacement_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_strikes ENABLE ROW LEVEL SECURITY;

-- Users: Users can read their own data, admins can read all
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Public can view basic user info" ON users
  FOR SELECT USING (
    is_banned = false
  );

-- Sessions: Users can only access their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
  FOR ALL USING (user_id = auth.uid());

-- Rooms: Public can read active rooms, creators can manage their rooms
CREATE POLICY "Public can view active rooms" ON rooms
  FOR SELECT USING (status = 'active');

CREATE POLICY "Room creators can update their rooms" ON rooms
  FOR UPDATE USING (creator_uid = auth.uid());

CREATE POLICY "Authenticated users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Room Members: Users can view memberships for rooms they're in
CREATE POLICY "Users can view own room memberships" ON room_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_members.room_id
      AND rm.user_id = auth.uid()
      AND rm.status = 'active'
    )
  );

CREATE POLICY "Users can create own room membership" ON room_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own room membership" ON room_members
  FOR UPDATE USING (user_id = auth.uid());

-- Proofs: Users can view their own proofs and proofs from their room
CREATE POLICY "Users can view own proofs" ON proofs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own proofs" ON proofs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own proofs" ON proofs
  FOR UPDATE USING (user_id = auth.uid());

-- Streaks: Users can only access their own streaks
CREATE POLICY "Users can view own streaks" ON streaks
  FOR ALL USING (user_id = auth.uid());

-- Notifications: Users can only access their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Follows: Users can manage their own follows
CREATE POLICY "Users can view own follows" ON follows
  FOR SELECT USING (from_user_id = auth.uid());

CREATE POLICY "Users can create own follows" ON follows
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Users can delete own follows" ON follows
  FOR DELETE USING (from_user_id = auth.uid());

-- Challenges: Users can view their own challenges
CREATE POLICY "Users can view own challenges" ON challenges
  FOR SELECT USING (from_uid = auth.uid() OR to_uid = auth.uid());

CREATE POLICY "Users can create challenges" ON challenges
  FOR INSERT WITH CHECK (from_uid = auth.uid());

CREATE POLICY "Users can update received challenges" ON challenges
  FOR UPDATE USING (to_uid = auth.uid());

-- Close Friends: Users can view their own friends
CREATE POLICY "Users can view own friends" ON close_friends
  FOR SELECT USING (a = auth.uid() OR b = auth.uid());

CREATE POLICY "Users can create friend requests" ON close_friend_requests
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Users can respond to friend requests" ON close_friend_requests
  FOR UPDATE USING (to_user_id = auth.uid());

CREATE POLICY "Users can delete own friends" ON close_friends
  FOR DELETE USING (a = auth.uid() OR b = auth.uid());

-- Freeze Tokens: Users can only access their own tokens
CREATE POLICY "Users can view own freeze tokens" ON freeze_tokens
  FOR ALL USING (user_id = auth.uid());

-- Waiting Queue: Users can only access their own queue entry
CREATE POLICY "Users can view own queue entry" ON waiting_queue
  FOR ALL USING (user_id = auth.uid());

-- Replacement Queue: Room members can view replacement status
CREATE POLICY "Users can view replacement status" ON replacement_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = replacement_queue.room_id
      AND rm.user_id = auth.uid()
      AND rm.status = 'active'
    )
  );

-- User Achievements: Users can only access their own achievements
CREATE POLICY "Users can view own achievements" ON user_achievements
  FOR ALL USING (user_id = auth.uid());

-- Activity Log: Users can only access their own activity
CREATE POLICY "Users can view own activity log" ON activity_log
  FOR ALL USING (user_id = auth.uid());

-- Moderation Events: Admins can view all, users can view their own
CREATE POLICY "Users can view own moderation events" ON moderation_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all moderation events" ON moderation_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- User Strikes: Users can view their own strikes, admins can view all
CREATE POLICY "Users can view own strikes" ON user_strikes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all strikes" ON user_strikes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Public tables (no RLS needed)
ALTER TABLE achievements DISABLE ROW LEVEL SECURITY;
ALTER TABLE config DISABLE ROW LEVEL SECURITY;
ALTER TABLE prohibited_terms DISABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_config DISABLE ROW LEVEL SECURITY;

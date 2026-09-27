-- Capitol Moderation System Schema
-- Migration: 002_moderation_system
-- Description: Database schema for automated content moderation system

-- Moderation events table (tracks all moderation actions)
CREATE TABLE IF NOT EXISTS moderation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT, -- ID of the moderated content (message, proof, etc.)
  content_type TEXT NOT NULL, -- 'room_message', 'team_mission', 'username', 'bio', etc.
  violation_category TEXT NOT NULL, -- 'racist', 'hateful', 'harassment', 'discriminatory', 'profanity'
  severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 5), -- 0=Safe, 1=Mild, 2=Targeted, 3=Severe, 4=Repeated, 5=Persistent
  action_taken TEXT NOT NULL, -- 'allowed', 'removed', 'warning', 'restriction', 'suspension', 'ban'
  detection_reason TEXT NOT NULL, -- Internal reason for the detection
  content_sample TEXT, -- Sample of the moderated content (for admin review)
  automated BOOLEAN DEFAULT true, -- Whether this was an automated detection
  reviewed_by_admin TEXT REFERENCES users(id), -- Admin who reviewed this event
  is_false_positive BOOLEAN DEFAULT false, -- If an admin marked this as false positive
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_content_type CHECK (content_type IN ('room_message', 'team_mission', 'username', 'display_name', 'bio', 'profile', 'other')),
  CONSTRAINT valid_action_taken CHECK (action_taken IN ('allowed', 'removed', 'warning', 'restriction', 'suspension', 'ban'))
);

-- Prohibited terms table (maintains the list of prohibited words/patterns)
CREATE TABLE IF NOT EXISTS prohibited_terms (
  id TEXT PRIMARY KEY,
  term TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL, -- 'racial_slur', 'hate_speech', 'harassment', 'discriminatory', 'severe'
  severity INTEGER NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT true,
  requires_context BOOLEAN DEFAULT false, -- Whether context matters for this term
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_term_category CHECK (category IN ('racial_slur', 'hate_speech', 'harassment', 'discriminatory', 'severe'))
);

-- User strike history table
CREATE TABLE IF NOT EXISTS user_strikes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  reason TEXT NOT NULL,
  related_event_id TEXT REFERENCES moderation_events(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE, -- For temporary strikes
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Moderation config table (stores configurable thresholds)
CREATE TABLE IF NOT EXISTS moderation_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

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

-- Insert initial prohibited terms (example set - should be maintained by admins)
-- Note: This is a sample set. The actual list should be maintained by administrators.
INSERT INTO prohibited_terms (id, term, category, severity, is_active, requires_context) VALUES
-- Racial slurs (severity 3)
('pt_001', 'nigger', 'racial_slur', 3, true, false),
('pt_002', 'nigga', 'racial_slur', 3, true, false),
('pt_003', 'chink', 'racial_slur', 3, true, false),
('pt_004', 'spic', 'racial_slur', 3, true, false),
('pt_005', 'kike', 'racial_slur', 3, true, false),
('pt_006', 'sandnigger', 'racial_slur', 3, true, false),
('pt_007', 'coon', 'racial_slur', 3, true, false),
('pt_008', 'wetback', 'racial_slur', 3, true, false),
-- Hate speech terms (severity 3)
('pt_010', 'white_power', 'hate_speech', 3, true, false),
('pt_011', 'white_lives_matter', 'hate_speech', 3, true, false),
('pt_012', 'hitler_was_right', 'hate_speech', 3, true, false),
-- Harassment patterns (severity 2)
('pt_020', 'kill_yourself', 'harassment', 2, true, false),
('pt_021', ' kys ', 'harassment', 2, true, false),
('pt_022', 'go_die', 'harassment', 2, true, false),
-- Discriminatory terms (severity 3)
('pt_030', 'all_lives_matter', 'discriminatory', 3, true, true),
('pt_031', 'not_a_real_gender', 'discriminatory', 3, true, false),
-- Severe abuse (severity 4)
('pt_040', 'i_will_kill_you', 'severe', 4, true, false),
('pt_041', 'rape_you', 'severe', 4, true, false),
('pt_042', 'bomb_threat', 'severe', 4, true, false)
ON CONFLICT (term) DO NOTHING;

-- Create indexes for performance
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
CREATE INDEX IF NOT EXISTS idx_user_strikes_created_at ON user_strikes(created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_moderation_events_updated_at BEFORE UPDATE ON moderation_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prohibited_terms_updated_at BEFORE UPDATE ON prohibited_terms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

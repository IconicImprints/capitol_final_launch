-- Capitol Atomic Functions for Supabase
-- These stored procedures wrap multi-step operations in true Postgres transactions
-- so partial failures cannot leave the database in an inconsistent state.
--
-- Apply this file in the Supabase Dashboard -> SQL Editor.

CREATE OR REPLACE FUNCTION atomic_signup(
  p_id TEXT,
  p_username TEXT,
  p_email TEXT,
  p_display_name TEXT,
  p_password_hash TEXT,
  p_avatar_config JSONB,
  p_invite_code TEXT,
  p_token TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_xp INTEGER DEFAULT 0,
  p_level INTEGER DEFAULT 1,
  p_streak INTEGER DEFAULT 0,
  p_best_streak INTEGER DEFAULT 0,
  p_missed_days INTEGER DEFAULT 0,
  p_warned BOOLEAN DEFAULT FALSE,
  p_kick_status TEXT DEFAULT 'ok',
  p_kicked_from_room BOOLEAN DEFAULT FALSE,
  p_proofs_count INTEGER DEFAULT 0,
  p_completed_rooms INTEGER DEFAULT 0,
  p_joined_rooms INTEGER DEFAULT 0,
  p_consistency_score INTEGER DEFAULT 0,
  p_near_miss_count INTEGER DEFAULT 0,
  p_league TEXT DEFAULT 'bronze',
  p_grace_active BOOLEAN DEFAULT FALSE,
  p_grace_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_grace_days_total INTEGER DEFAULT 0,
  p_total_grace_used INTEGER DEFAULT 0,
  p_last_submit_date DATE DEFAULT NULL,
  p_onboarding_complete BOOLEAN DEFAULT FALSE,
  p_onboarding_questions_complete BOOLEAN DEFAULT FALSE,
  p_niche TEXT DEFAULT '',
  p_age_range TEXT DEFAULT '',
  p_room_joined_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_onboard_bonus_awarded BOOLEAN DEFAULT FALSE,
  p_safety_accepted TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_invites_count INTEGER DEFAULT 0,
  p_burned_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_following JSONB DEFAULT '[]',
  p_premium BOOLEAN DEFAULT FALSE,
  p_xp_awarded_keys JSONB DEFAULT '{}'
) RETURNS TEXT AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_expires_at TIMESTAMP WITH TIME ZONE := NOW() + INTERVAL '7 days';
BEGIN
  INSERT INTO users (
    id, username, email, display_name, password_hash, avatar_config,
    created_at, last_seen_at,
    xp, level, streak, best_streak, missed_days, warned,
    kick_status, kicked_from_room,
    proofs_count, completed_rooms, joined_rooms, join_timestamp,
    consistency_score, near_miss_count, league,
    grace_active, grace_start_date, grace_days_total, total_grace_used,
    last_submit_date,
    onboarding_complete, onboarding_questions_complete,
    niche, age_range, room_joined_at, onboard_bonus_awarded,
    safety_accepted, invite_code, invites_count, burned_at,
    following, premium, xp_awarded_keys
  ) VALUES (
    p_id, p_username, p_email, p_display_name, p_password_hash, p_avatar_config,
    v_now, v_now,
    p_xp, p_level, p_streak, p_best_streak, p_missed_days, p_warned,
    p_kick_status, p_kicked_from_room,
    p_proofs_count, p_completed_rooms, p_joined_rooms, v_now,
    p_consistency_score, p_near_miss_count, p_league,
    p_grace_active, p_grace_start_date, p_grace_days_total, p_total_grace_used,
    p_last_submit_date,
    p_onboarding_complete, p_onboarding_questions_complete,
    p_niche, p_age_range, p_room_joined_at, p_onboard_bonus_awarded,
    p_safety_accepted, p_invite_code, p_invites_count, p_burned_at,
    p_following, p_premium, p_xp_awarded_keys
  );

  INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address, user_agent)
  VALUES (p_token, p_id, v_now, v_expires_at, p_ip_address, p_user_agent);

  RETURN p_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Username or email already exists';
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION atomic_create_room_with_membership(
  p_room_id TEXT,
  p_user_id TEXT,
  p_name TEXT,
  p_icon TEXT DEFAULT 'bolt',
  p_goal TEXT DEFAULT '',
  p_niche TEXT DEFAULT 'general',
  p_age_range TEXT DEFAULT NULL,
  p_tags JSONB DEFAULT '[]',
  p_max_members INTEGER DEFAULT 8,
  p_elite BOOLEAN DEFAULT FALSE,
  p_days INTEGER DEFAULT 30,
  p_creator_uid TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active'
) RETURNS TEXT AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_member_id TEXT;
BEGIN
  v_member_id := 'rm_' || EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || '_' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);

  UPDATE room_members
  SET status = 'left', left_at = v_now
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO rooms (
    id, name, icon, goal, niche, age_range, tags,
    max_members, elite, days, created_at, creator_uid, status
  ) VALUES (
    p_room_id, p_name, p_icon, p_goal, p_niche, p_age_range, p_tags,
    p_max_members, p_elite, p_days, v_now, p_creator_uid, p_status
  );

  INSERT INTO room_members (id, room_id, user_id, status, joined_at)
  VALUES (v_member_id, p_room_id, p_user_id, 'active', v_now);

  UPDATE users
  SET room_joined_at = v_now, joined_rooms = joined_rooms + 1
  WHERE id = p_user_id;

  RETURN p_room_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION atomic_submit_proof(
  p_proof_id TEXT,
  p_user_id TEXT,
  p_date_key DATE,
  p_streak INTEGER,
  p_xp_earned INTEGER,
  p_image_url TEXT DEFAULT NULL,
  p_link TEXT DEFAULT '',
  p_note TEXT DEFAULT '',
  p_ai_verdict TEXT DEFAULT 'approved',
  p_room_id TEXT DEFAULT NULL,
  p_votes JSONB DEFAULT '{}',
  p_gesture TEXT DEFAULT NULL,
  p_best_streak INTEGER DEFAULT 0
) RETURNS TABLE(new_xp INTEGER, new_level INTEGER, current_streak INTEGER) AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_user_xp INTEGER;
  v_user_level INTEGER;
  v_user_proofs_count INTEGER;
BEGIN
  INSERT INTO proofs (
    id, user_id, date_key, created_at, image_url, link, note,
    streak, xp_earned, ai_verdict, room_id, votes, gesture
  ) VALUES (
    p_proof_id, p_user_id, p_date_key, v_now, p_image_url, p_link, p_note,
    p_streak, p_xp_earned, p_ai_verdict, p_room_id, p_votes, p_gesture
  );

  SELECT users.xp, users.level, users.proofs_count INTO v_user_xp, v_user_level, v_user_proofs_count
  FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  UPDATE users
  SET
    streak = p_streak,
    best_streak = GREATEST(p_best_streak, p_streak),
    last_submit_date = p_date_key,
    proofs_count = v_user_proofs_count + 1,
    missed_days = 0,
    warned = FALSE
  WHERE id = p_user_id;

  v_user_xp := GREATEST(0, v_user_xp + p_xp_earned);
  v_user_level := 1;
  WHILE 50 * POWER(v_user_level::DOUBLE PRECISION, 1.4) <= v_user_xp LOOP
    v_user_level := v_user_level + 1;
  END LOOP;
  v_user_level := GREATEST(1, v_user_level);

  UPDATE users
  SET xp = v_user_xp, level = v_user_level
  WHERE id = p_user_id;

  INSERT INTO streaks (user_id, current_streak, best_streak, last_qualifying_date, updated_at)
  VALUES (p_user_id, p_streak, p_streak, p_date_key, v_now)
  ON CONFLICT (user_id) DO UPDATE
  SET current_streak = p_streak, best_streak = p_streak, last_qualifying_date = p_date_key, updated_at = v_now;

  RETURN QUERY SELECT v_user_xp, v_user_level, p_streak;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION atomic_update_user_xp(
  p_user_id TEXT,
  p_amount INTEGER,
  p_reason TEXT
) RETURNS TABLE(xp INTEGER, level INTEGER, xp_awarded_keys JSONB) AS $$
DECLARE
  v_now TEXT := SUBSTRING(NOW()::TEXT, 1, 10);
  v_key TEXT := 'xp_' || p_reason || '_' || v_now;
  v_user_xp INTEGER;
  v_user_level INTEGER;
  v_user_keys JSONB;
BEGIN
  SELECT users.xp, users.level, users.xp_awarded_keys INTO v_user_xp, v_user_level, v_user_keys
  FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  v_user_keys := COALESCE(v_user_keys, '{}');
  IF v_user_keys ? v_key THEN
    RETURN QUERY SELECT v_user_xp, v_user_level, v_user_keys;
    RETURN;
  END IF;

  v_user_xp := GREATEST(0, v_user_xp + p_amount);
  v_user_keys := v_user_keys || jsonb_build_object(v_key, true);

  v_user_level := 1;
  WHILE 50 * POWER(v_user_level::DOUBLE PRECISION, 1.4) <= v_user_xp LOOP
    v_user_level := v_user_level + 1;
  END LOOP;
  v_user_level := GREATEST(1, v_user_level);

  UPDATE users
  SET xp = v_user_xp, level = v_user_level, xp_awarded_keys = v_user_keys
  WHERE id = p_user_id;

  RETURN QUERY SELECT v_user_xp, v_user_level, v_user_keys;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


GRANT EXECUTE ON FUNCTION atomic_signup(
  TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT,
  INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT, BOOLEAN,
  INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, BOOLEAN, TIMESTAMP WITH TIME ZONE,
  INTEGER, INTEGER, DATE, BOOLEAN, BOOLEAN, TEXT, TEXT, TIMESTAMP WITH TIME ZONE,
  BOOLEAN, TIMESTAMP WITH TIME ZONE, INTEGER, TIMESTAMP WITH TIME ZONE, JSONB, BOOLEAN, JSONB
) TO service_role;

GRANT EXECUTE ON FUNCTION atomic_create_room_with_membership(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, INTEGER, TEXT, TEXT
) TO service_role;

GRANT EXECUTE ON FUNCTION atomic_submit_proof(
  TEXT, TEXT, DATE, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) TO service_role;

GRANT EXECUTE ON FUNCTION atomic_update_user_xp(TEXT, INTEGER, TEXT) TO service_role;

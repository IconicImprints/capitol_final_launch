


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "days" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "xp_change" integer DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_action_type" CHECK (("action_type" = ANY (ARRAY['proof'::"text", 'referral'::"text", 'kick_penalty'::"text", 'freeze_token'::"text", 'manual'::"text", 'streak_bonus'::"text"])))
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenges" (
    "id" "text" NOT NULL,
    "from_uid" "text" NOT NULL,
    "to_uid" "text" NOT NULL,
    "duration_days" integer DEFAULT 7,
    "stakes" integer DEFAULT 0,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_challenge_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."close_friend_requests" (
    "id" "text" NOT NULL,
    "from_user_id" "text" NOT NULL,
    "to_user_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_request_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."close_friend_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."close_friends" (
    "id" "text" NOT NULL,
    "a" "text" NOT NULL,
    "b" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "no_self_friend" CHECK (("a" <> "b"))
);


ALTER TABLE "public"."close_friends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."config" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL
);


ALTER TABLE "public"."config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "from_user_id" "text" NOT NULL,
    "to_user_id" "text" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "no_self_follow" CHECK (("from_user_id" <> "to_user_id"))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."freeze_tokens" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "used" boolean DEFAULT false,
    "bought_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."freeze_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_config" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL
);


ALTER TABLE "public"."moderation_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_events" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "content_id" "text",
    "content_type" "text" NOT NULL,
    "violation_category" "text" NOT NULL,
    "severity" integer NOT NULL,
    "action_taken" "text" NOT NULL,
    "detection_reason" "text" NOT NULL,
    "content_sample" "text",
    "automated" boolean DEFAULT true,
    "reviewed_by_admin" "text",
    "is_false_positive" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "moderation_events_severity_check" CHECK ((("severity" >= 0) AND ("severity" <= 5))),
    CONSTRAINT "valid_action_taken" CHECK (("action_taken" = ANY (ARRAY['allowed'::"text", 'removed'::"text", 'warning'::"text", 'restriction'::"text", 'suspension'::"text", 'ban'::"text"]))),
    CONSTRAINT "valid_content_type" CHECK (("content_type" = ANY (ARRAY['room_message'::"text", 'team_mission'::"text", 'username'::"text", 'display_name'::"text", 'bio'::"text", 'profile'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."moderation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "valid_notification_type" CHECK (("type" = ANY (ARRAY['info'::"text", 'proof'::"text", 'kick'::"text", 'challenge'::"text", 'follow'::"text", 'friend_request'::"text", 'room_joined'::"text", 'new_member'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prohibited_terms" (
    "id" "text" NOT NULL,
    "term" "text" NOT NULL,
    "category" "text" NOT NULL,
    "severity" integer DEFAULT 3 NOT NULL,
    "is_active" boolean DEFAULT true,
    "requires_context" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "prohibited_terms_severity_check" CHECK ((("severity" >= 1) AND ("severity" <= 5))),
    CONSTRAINT "valid_term_category" CHECK (("category" = ANY (ARRAY['racial_slur'::"text", 'hate_speech'::"text", 'harassment'::"text", 'discriminatory'::"text", 'severe'::"text"])))
);


ALTER TABLE "public"."prohibited_terms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proofs" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "date_key" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text",
    "link" "text",
    "note" "text",
    "streak" integer DEFAULT 0,
    "xp_earned" integer DEFAULT 0,
    "ai_verdict" "text" DEFAULT 'approved'::"text",
    "room_id" "text",
    "votes" "jsonb" DEFAULT '{}'::"jsonb",
    "gesture" "text",
    CONSTRAINT "valid_ai_verdict" CHECK (("ai_verdict" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'pending'::"text", 'flagged'::"text"])))
);


ALTER TABLE "public"."proofs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."replacement_queue" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "attempts" integer DEFAULT 0,
    "error" "text",
    "reason" "text",
    "candidate_id" "text",
    CONSTRAINT "valid_replacement_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."replacement_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_members" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "left_at" timestamp with time zone,
    "inactive_since" timestamp with time zone,
    "inactive_reason" "text",
    "replacement" boolean DEFAULT false,
    CONSTRAINT "valid_member_status" CHECK (("status" = ANY (ARRAY['active'::"text", 'left'::"text", 'kicked'::"text", 'inactive_kicked'::"text"])))
);


ALTER TABLE "public"."room_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT 'bolt'::"text",
    "goal" "text",
    "niche" "text" DEFAULT 'general'::"text",
    "age_range" "text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "max_members" integer DEFAULT 8,
    "elite" boolean DEFAULT false,
    "days" integer DEFAULT 30,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "creator_uid" "text",
    "status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "valid_room_size" CHECK ((("max_members" >= 3) AND ("max_members" <= 8))),
    CONSTRAINT "valid_room_status" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "token" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "ip_address" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."streaks" (
    "user_id" "text" NOT NULL,
    "current_streak" integer DEFAULT 0,
    "best_streak" integer DEFAULT 0,
    "last_qualifying_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."streaks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "achievement_days" integer NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_strikes" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "severity" integer NOT NULL,
    "reason" "text" NOT NULL,
    "related_event_id" "text",
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_strikes_severity_check" CHECK ((("severity" >= 1) AND ("severity" <= 5)))
);


ALTER TABLE "public"."user_strikes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "text" NOT NULL,
    "username" "text" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "photo_url" "text",
    "avatar_config" "jsonb",
    "banner_url" "text",
    "bio" "text",
    "pronouns" "text",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "social_links" "jsonb" DEFAULT '{}'::"jsonb",
    "is_admin" boolean DEFAULT false,
    "is_banned" boolean DEFAULT false,
    "is_suspended" boolean DEFAULT false,
    "suspension_end" timestamp with time zone,
    "suspend_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "xp" integer DEFAULT 0,
    "level" integer DEFAULT 1,
    "streak" integer DEFAULT 0,
    "best_streak" integer DEFAULT 0,
    "missed_days" integer DEFAULT 0,
    "warned" boolean DEFAULT false,
    "kick_status" "text" DEFAULT 'ok'::"text",
    "kicked_from_room" boolean DEFAULT false,
    "proofs_count" integer DEFAULT 0,
    "completed_rooms" integer DEFAULT 0,
    "joined_rooms" integer DEFAULT 0,
    "join_timestamp" timestamp with time zone,
    "consistency_score" integer DEFAULT 0,
    "near_miss_count" integer DEFAULT 0,
    "league" "text" DEFAULT 'bronze'::"text",
    "grace_active" boolean DEFAULT false,
    "grace_start_date" timestamp with time zone,
    "grace_days_total" integer DEFAULT 0,
    "total_grace_used" integer DEFAULT 0,
    "last_submit_date" "date",
    "vulture_claimed" timestamp with time zone,
    "onboarding_complete" boolean DEFAULT false,
    "onboarding_questions_complete" boolean DEFAULT false,
    "niche" "text" DEFAULT ''::"text",
    "age_range" "text" DEFAULT ''::"text",
    "room_joined_at" timestamp with time zone,
    "onboard_bonus_awarded" boolean DEFAULT false,
    "safety_accepted" timestamp with time zone,
    "invite_code" "text",
    "invites_count" integer DEFAULT 0,
    "burned_at" timestamp with time zone,
    "following" "jsonb" DEFAULT '[]'::"jsonb",
    "premium" boolean DEFAULT false,
    "xp_awarded_keys" "jsonb" DEFAULT '{}'::"jsonb",
    "grace_used_this_month" integer DEFAULT 0,
    "grace_last_month" "text" DEFAULT ''::"text",
    CONSTRAINT "valid_age_range" CHECK (("age_range" = ANY (ARRAY[''::"text", '13_17'::"text", '18_22'::"text", '23_29'::"text", '30_39'::"text", '40_'::"text"]))),
    CONSTRAINT "valid_kick_status" CHECK (("kick_status" = ANY (ARRAY['ok'::"text", 'warned'::"text", 'flagged'::"text", 'kicked'::"text", 'inactive'::"text"]))),
    CONSTRAINT "valid_league" CHECK (("league" = ANY (ARRAY['bronze'::"text", 'silver'::"text", 'gold'::"text", 'platinum'::"text", 'diamond'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waiting_queue" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "niche" "text" DEFAULT ''::"text",
    "age_range" "text" DEFAULT ''::"text",
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."waiting_queue" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("days");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."close_friend_requests"
    ADD CONSTRAINT "close_friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."close_friends"
    ADD CONSTRAINT "close_friends_a_b_key" UNIQUE ("a", "b");



ALTER TABLE ONLY "public"."close_friends"
    ADD CONSTRAINT "close_friends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config"
    ADD CONSTRAINT "config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("from_user_id", "to_user_id");



ALTER TABLE ONLY "public"."freeze_tokens"
    ADD CONSTRAINT "freeze_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderation_config"
    ADD CONSTRAINT "moderation_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."moderation_events"
    ADD CONSTRAINT "moderation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prohibited_terms"
    ADD CONSTRAINT "prohibited_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prohibited_terms"
    ADD CONSTRAINT "prohibited_terms_term_key" UNIQUE ("term");



ALTER TABLE ONLY "public"."proofs"
    ADD CONSTRAINT "proofs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."replacement_queue"
    ADD CONSTRAINT "replacement_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."streaks"
    ADD CONSTRAINT "streaks_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_achievement_days_key" UNIQUE ("user_id", "achievement_days");



ALTER TABLE ONLY "public"."user_strikes"
    ADD CONSTRAINT "user_strikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."waiting_queue"
    ADD CONSTRAINT "waiting_queue_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_log_action_type" ON "public"."activity_log" USING "btree" ("action_type");



CREATE INDEX "idx_activity_log_created_at" ON "public"."activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_log_user_id" ON "public"."activity_log" USING "btree" ("user_id");



CREATE INDEX "idx_follows_from_user" ON "public"."follows" USING "btree" ("from_user_id");



CREATE INDEX "idx_follows_to_user" ON "public"."follows" USING "btree" ("to_user_id");



CREATE INDEX "idx_moderation_events_automated" ON "public"."moderation_events" USING "btree" ("automated");



CREATE INDEX "idx_moderation_events_content_id" ON "public"."moderation_events" USING "btree" ("content_id");



CREATE INDEX "idx_moderation_events_created_at" ON "public"."moderation_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_moderation_events_false_positive" ON "public"."moderation_events" USING "btree" ("is_false_positive");



CREATE INDEX "idx_moderation_events_severity" ON "public"."moderation_events" USING "btree" ("severity");



CREATE INDEX "idx_moderation_events_user_id" ON "public"."moderation_events" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_prohibited_terms_active" ON "public"."prohibited_terms" USING "btree" ("is_active");



CREATE INDEX "idx_prohibited_terms_category" ON "public"."prohibited_terms" USING "btree" ("category");



CREATE INDEX "idx_prohibited_terms_severity" ON "public"."prohibited_terms" USING "btree" ("severity");



CREATE INDEX "idx_proofs_created_at" ON "public"."proofs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_proofs_date_key" ON "public"."proofs" USING "btree" ("date_key");



CREATE INDEX "idx_proofs_room_id" ON "public"."proofs" USING "btree" ("room_id");



CREATE INDEX "idx_proofs_user_id" ON "public"."proofs" USING "btree" ("user_id");



CREATE INDEX "idx_replacement_queue_room_id" ON "public"."replacement_queue" USING "btree" ("room_id");



CREATE INDEX "idx_replacement_queue_status" ON "public"."replacement_queue" USING "btree" ("status");



CREATE INDEX "idx_room_members_joined_at" ON "public"."room_members" USING "btree" ("joined_at");



CREATE INDEX "idx_room_members_room_id" ON "public"."room_members" USING "btree" ("room_id");



CREATE INDEX "idx_room_members_status" ON "public"."room_members" USING "btree" ("status");



CREATE INDEX "idx_room_members_user_id" ON "public"."room_members" USING "btree" ("user_id");



CREATE INDEX "idx_rooms_age_range" ON "public"."rooms" USING "btree" ("age_range");



CREATE INDEX "idx_rooms_created_at" ON "public"."rooms" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_rooms_niche" ON "public"."rooms" USING "btree" ("niche");



CREATE INDEX "idx_rooms_status" ON "public"."rooms" USING "btree" ("status");



CREATE INDEX "idx_sessions_expires_at" ON "public"."sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_sessions_user_id" ON "public"."sessions" USING "btree" ("user_id");



CREATE INDEX "idx_user_strikes_active" ON "public"."user_strikes" USING "btree" ("is_active");



CREATE INDEX "idx_user_strikes_created_at" ON "public"."user_strikes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_strikes_expires_at" ON "public"."user_strikes" USING "btree" ("expires_at");



CREATE INDEX "idx_user_strikes_severity" ON "public"."user_strikes" USING "btree" ("severity");



CREATE INDEX "idx_user_strikes_user_id" ON "public"."user_strikes" USING "btree" ("user_id");



CREATE INDEX "idx_users_age_range" ON "public"."users" USING "btree" ("age_range");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_invite_code" ON "public"."users" USING "btree" ("invite_code");



CREATE INDEX "idx_users_league" ON "public"."users" USING "btree" ("league");



CREATE INDEX "idx_users_niche" ON "public"."users" USING "btree" ("niche");



CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username");



CREATE INDEX "idx_users_xp" ON "public"."users" USING "btree" ("xp" DESC);



CREATE INDEX "idx_waiting_queue_age_range" ON "public"."waiting_queue" USING "btree" ("age_range");



CREATE INDEX "idx_waiting_queue_niche" ON "public"."waiting_queue" USING "btree" ("niche");



CREATE INDEX "idx_waiting_queue_user_id" ON "public"."waiting_queue" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "update_moderation_events_updated_at" BEFORE UPDATE ON "public"."moderation_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_prohibited_terms_updated_at" BEFORE UPDATE ON "public"."prohibited_terms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_from_uid_fkey" FOREIGN KEY ("from_uid") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_to_uid_fkey" FOREIGN KEY ("to_uid") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."close_friend_requests"
    ADD CONSTRAINT "close_friend_requests_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."close_friend_requests"
    ADD CONSTRAINT "close_friend_requests_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."close_friends"
    ADD CONSTRAINT "close_friends_a_fkey" FOREIGN KEY ("a") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."close_friends"
    ADD CONSTRAINT "close_friends_b_fkey" FOREIGN KEY ("b") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."freeze_tokens"
    ADD CONSTRAINT "freeze_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moderation_events"
    ADD CONSTRAINT "moderation_events_reviewed_by_admin_fkey" FOREIGN KEY ("reviewed_by_admin") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."moderation_events"
    ADD CONSTRAINT "moderation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proofs"
    ADD CONSTRAINT "proofs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proofs"
    ADD CONSTRAINT "proofs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."replacement_queue"
    ADD CONSTRAINT "replacement_queue_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."replacement_queue"
    ADD CONSTRAINT "replacement_queue_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_creator_uid_fkey" FOREIGN KEY ("creator_uid") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."streaks"
    ADD CONSTRAINT "streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_days_fkey" FOREIGN KEY ("achievement_days") REFERENCES "public"."achievements"("days") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_strikes"
    ADD CONSTRAINT "user_strikes_related_event_id_fkey" FOREIGN KEY ("related_event_id") REFERENCES "public"."moderation_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_strikes"
    ADD CONSTRAINT "user_strikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waiting_queue"
    ADD CONSTRAINT "waiting_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."close_friend_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."close_friends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."freeze_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderation_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prohibited_terms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proofs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."replacement_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."streaks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_strikes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waiting_queue" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."achievements" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."achievements" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."achievements" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_log" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."challenges" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."challenges" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."challenges" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."close_friend_requests" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."close_friend_requests" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."close_friend_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."close_friends" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."close_friends" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."close_friends" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."follows" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."follows" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."follows" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."freeze_tokens" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."freeze_tokens" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."freeze_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_config" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_config" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_config" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_events" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."prohibited_terms" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."prohibited_terms" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."prohibited_terms" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."proofs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."proofs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."proofs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."replacement_queue" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."replacement_queue" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."replacement_queue" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_members" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_members" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_members" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sessions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sessions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sessions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."streaks" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."streaks" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."streaks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_achievements" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_achievements" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_achievements" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_strikes" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_strikes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_strikes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."waiting_queue" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."waiting_queue" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."waiting_queue" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";




































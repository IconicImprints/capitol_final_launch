export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          days: number
          description: string
          name: string
        }
        Insert: {
          days: number
          description: string
          name: string
        }
        Update: {
          days?: number
          description?: string
          name?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          user_id: string
          xp_change: number | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id: string
          metadata?: Json | null
          user_id: string
          xp_change?: number | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
          xp_change?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          created_at: string | null
          duration_days: number | null
          from_uid: string
          id: string
          message: string | null
          stakes: number | null
          status: string | null
          to_uid: string
        }
        Insert: {
          created_at?: string | null
          duration_days?: number | null
          from_uid: string
          id: string
          message?: string | null
          stakes?: number | null
          status?: string | null
          to_uid: string
        }
        Update: {
          created_at?: string | null
          duration_days?: number | null
          from_uid?: string
          id?: string
          message?: string | null
          stakes?: number | null
          status?: string | null
          to_uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_from_uid_fkey"
            columns: ["from_uid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_to_uid_fkey"
            columns: ["to_uid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      close_friend_requests: {
        Row: {
          created_at: string | null
          from_user_id: string
          id: string
          status: string | null
          to_user_id: string
        }
        Insert: {
          created_at?: string | null
          from_user_id: string
          id: string
          status?: string | null
          to_user_id: string
        }
        Update: {
          created_at?: string | null
          from_user_id?: string
          id?: string
          status?: string | null
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "close_friend_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friend_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      close_friends: {
        Row: {
          a: string
          b: string
          created_at: string | null
          id: string
        }
        Insert: {
          a: string
          b: string
          created_at?: string | null
          id: string
        }
        Update: {
          a?: string
          b?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "close_friends_a_fkey"
            columns: ["a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friends_b_fkey"
            columns: ["b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      follows: {
        Row: {
          at: string | null
          from_user_id: string
          to_user_id: string
        }
        Insert: {
          at?: string | null
          from_user_id: string
          to_user_id: string
        }
        Update: {
          at?: string | null
          from_user_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      freeze_tokens: {
        Row: {
          bought_at: string | null
          id: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          bought_at?: string | null
          id: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          bought_at?: string | null
          id?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freeze_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_config: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      moderation_events: {
        Row: {
          action_taken: string
          automated: boolean | null
          content_id: string | null
          content_sample: string | null
          content_type: string
          created_at: string | null
          detection_reason: string
          id: string
          is_false_positive: boolean | null
          reviewed_by_admin: string | null
          severity: number
          updated_at: string | null
          user_id: string
          violation_category: string
        }
        Insert: {
          action_taken: string
          automated?: boolean | null
          content_id?: string | null
          content_sample?: string | null
          content_type: string
          created_at?: string | null
          detection_reason: string
          id: string
          is_false_positive?: boolean | null
          reviewed_by_admin?: string | null
          severity: number
          updated_at?: string | null
          user_id: string
          violation_category: string
        }
        Update: {
          action_taken?: string
          automated?: boolean | null
          content_id?: string | null
          content_sample?: string | null
          content_type?: string
          created_at?: string | null
          detection_reason?: string
          id?: string
          is_false_positive?: boolean | null
          reviewed_by_admin?: string | null
          severity?: number
          updated_at?: string | null
          user_id?: string
          violation_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_events_reviewed_by_admin_fkey"
            columns: ["reviewed_by_admin"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          read: boolean | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id: string
          read?: boolean | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          read?: boolean | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prohibited_terms: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          requires_context: boolean | null
          severity: number
          term: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id: string
          is_active?: boolean | null
          requires_context?: boolean | null
          severity?: number
          term: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          requires_context?: boolean | null
          severity?: number
          term?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      proofs: {
        Row: {
          ai_verdict: string | null
          created_at: string | null
          date_key: string
          gesture: string | null
          id: string
          image_url: string | null
          link: string | null
          note: string | null
          room_id: string | null
          streak: number | null
          user_id: string
          votes: Json | null
          xp_earned: number | null
        }
        Insert: {
          ai_verdict?: string | null
          created_at?: string | null
          date_key: string
          gesture?: string | null
          id: string
          image_url?: string | null
          link?: string | null
          note?: string | null
          room_id?: string | null
          streak?: number | null
          user_id: string
          votes?: Json | null
          xp_earned?: number | null
        }
        Update: {
          ai_verdict?: string | null
          created_at?: string | null
          date_key?: string
          gesture?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          note?: string | null
          room_id?: string | null
          streak?: number | null
          user_id?: string
          votes?: Json | null
          xp_earned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proofs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proofs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      replacement_queue: {
        Row: {
          attempts: number | null
          candidate_id: string | null
          created_at: string | null
          error: string | null
          id: string
          reason: string | null
          room_id: string
          status: string | null
        }
        Insert: {
          attempts?: number | null
          candidate_id?: string | null
          created_at?: string | null
          error?: string | null
          id: string
          reason?: string | null
          room_id: string
          status?: string | null
        }
        Update: {
          attempts?: number | null
          candidate_id?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          reason?: string | null
          room_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replacement_queue_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_queue_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          id: string
          inactive_reason: string | null
          inactive_since: string | null
          joined_at: string | null
          left_at: string | null
          replacement: boolean | null
          room_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          id: string
          inactive_reason?: string | null
          inactive_since?: string | null
          joined_at?: string | null
          left_at?: string | null
          replacement?: boolean | null
          room_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          id?: string
          inactive_reason?: string | null
          inactive_since?: string | null
          joined_at?: string | null
          left_at?: string | null
          replacement?: boolean | null
          room_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          age_range: string | null
          created_at: string | null
          creator_uid: string | null
          days: number | null
          elite: boolean | null
          goal: string | null
          icon: string | null
          id: string
          max_members: number | null
          name: string
          niche: string | null
          status: string | null
          tags: Json | null
        }
        Insert: {
          age_range?: string | null
          created_at?: string | null
          creator_uid?: string | null
          days?: number | null
          elite?: boolean | null
          goal?: string | null
          icon?: string | null
          id: string
          max_members?: number | null
          name: string
          niche?: string | null
          status?: string | null
          tags?: Json | null
        }
        Update: {
          age_range?: string | null
          created_at?: string | null
          creator_uid?: string | null
          days?: number | null
          elite?: boolean | null
          goal?: string | null
          icon?: string | null
          id?: string
          max_members?: number | null
          name?: string
          niche?: string | null
          status?: string | null
          tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_creator_uid_fkey"
            columns: ["creator_uid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          ip_address: string | null
          token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          ip_address?: string | null
          token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          ip_address?: string | null
          token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          best_streak: number | null
          current_streak: number | null
          last_qualifying_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          best_streak?: number | null
          current_streak?: number | null
          last_qualifying_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          best_streak?: number | null
          current_streak?: number | null
          last_qualifying_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_days: number
          id: string
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          achievement_days: number
          id: string
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          achievement_days?: number
          id?: string
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_days_fkey"
            columns: ["achievement_days"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["days"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_strikes: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          reason: string
          related_event_id: string | null
          severity: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id: string
          is_active?: boolean | null
          reason: string
          related_event_id?: string | null
          severity: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string
          related_event_id?: string | null
          severity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_strikes_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "moderation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_strikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          age_range: string | null
          avatar_config: Json | null
          banner_url: string | null
          best_streak: number | null
          bio: string | null
          burned_at: string | null
          completed_rooms: number | null
          consistency_score: number | null
          created_at: string | null
          display_name: string
          email: string
          following: Json | null
          grace_active: boolean | null
          grace_days_total: number | null
          grace_last_month: string | null
          grace_start_date: string | null
          grace_used_this_month: number | null
          id: string
          invite_code: string | null
          invites_count: number | null
          is_admin: boolean | null
          is_banned: boolean | null
          is_suspended: boolean | null
          join_timestamp: string | null
          joined_rooms: number | null
          kick_status: string | null
          kicked_from_room: boolean | null
          last_seen_at: string | null
          last_submit_date: string | null
          league: string | null
          level: number | null
          missed_days: number | null
          near_miss_count: number | null
          niche: string | null
          onboard_bonus_awarded: boolean | null
          onboarding_complete: boolean | null
          onboarding_questions_complete: boolean | null
          password_hash: string
          photo_url: string | null
          premium: boolean | null
          pronouns: string | null
          proofs_count: number | null
          room_joined_at: string | null
          safety_accepted: string | null
          social_links: Json | null
          streak: number | null
          suspend_reason: string | null
          suspension_end: string | null
          timezone: string | null
          total_grace_used: number | null
          username: string
          vulture_claimed: string | null
          warned: boolean | null
          xp: number | null
          xp_awarded_keys: Json | null
        }
        Insert: {
          age_range?: string | null
          avatar_config?: Json | null
          banner_url?: string | null
          best_streak?: number | null
          bio?: string | null
          burned_at?: string | null
          completed_rooms?: number | null
          consistency_score?: number | null
          created_at?: string | null
          display_name: string
          email: string
          following?: Json | null
          grace_active?: boolean | null
          grace_days_total?: number | null
          grace_last_month?: string | null
          grace_start_date?: string | null
          grace_used_this_month?: number | null
          id: string
          invite_code?: string | null
          invites_count?: number | null
          is_admin?: boolean | null
          is_banned?: boolean | null
          is_suspended?: boolean | null
          join_timestamp?: string | null
          joined_rooms?: number | null
          kick_status?: string | null
          kicked_from_room?: boolean | null
          last_seen_at?: string | null
          last_submit_date?: string | null
          league?: string | null
          level?: number | null
          missed_days?: number | null
          near_miss_count?: number | null
          niche?: string | null
          onboard_bonus_awarded?: boolean | null
          onboarding_complete?: boolean | null
          onboarding_questions_complete?: boolean | null
          password_hash: string
          photo_url?: string | null
          premium?: boolean | null
          pronouns?: string | null
          proofs_count?: number | null
          room_joined_at?: string | null
          safety_accepted?: string | null
          social_links?: Json | null
          streak?: number | null
          suspend_reason?: string | null
          suspension_end?: string | null
          timezone?: string | null
          total_grace_used?: number | null
          username: string
          vulture_claimed?: string | null
          warned?: boolean | null
          xp?: number | null
          xp_awarded_keys?: Json | null
        }
        Update: {
          age_range?: string | null
          avatar_config?: Json | null
          banner_url?: string | null
          best_streak?: number | null
          bio?: string | null
          burned_at?: string | null
          completed_rooms?: number | null
          consistency_score?: number | null
          created_at?: string | null
          display_name?: string
          email?: string
          following?: Json | null
          grace_active?: boolean | null
          grace_days_total?: number | null
          grace_last_month?: string | null
          grace_start_date?: string | null
          grace_used_this_month?: number | null
          id?: string
          invite_code?: string | null
          invites_count?: number | null
          is_admin?: boolean | null
          is_banned?: boolean | null
          is_suspended?: boolean | null
          join_timestamp?: string | null
          joined_rooms?: number | null
          kick_status?: string | null
          kicked_from_room?: boolean | null
          last_seen_at?: string | null
          last_submit_date?: string | null
          league?: string | null
          level?: number | null
          missed_days?: number | null
          near_miss_count?: number | null
          niche?: string | null
          onboard_bonus_awarded?: boolean | null
          onboarding_complete?: boolean | null
          onboarding_questions_complete?: boolean | null
          password_hash?: string
          photo_url?: string | null
          premium?: boolean | null
          pronouns?: string | null
          proofs_count?: number | null
          room_joined_at?: string | null
          safety_accepted?: string | null
          social_links?: Json | null
          streak?: number | null
          suspend_reason?: string | null
          suspension_end?: string | null
          timezone?: string | null
          total_grace_used?: number | null
          username?: string
          vulture_claimed?: string | null
          warned?: boolean | null
          xp?: number | null
          xp_awarded_keys?: Json | null
        }
        Relationships: []
      }
      waiting_queue: {
        Row: {
          age_range: string | null
          id: string
          joined_at: string | null
          niche: string | null
          user_id: string
        }
        Insert: {
          age_range?: string | null
          id: string
          joined_at?: string | null
          niche?: string | null
          user_id: string
        }
        Update: {
          age_range?: string | null
          id?: string
          joined_at?: string | null
          niche?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiting_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

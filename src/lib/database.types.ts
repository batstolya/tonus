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
      ai_analyses: {
        Row: {
          created_at: string | null
          focus: Json
          good: Json
          id: string
          improve: Json
          model: string
          period_end: string
          period_start: string
          summary: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          focus?: Json
          good?: Json
          id?: string
          improve?: Json
          model: string
          period_end: string
          period_start: string
          summary: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          focus?: Json
          good?: Json
          id?: string
          improve?: Json
          model?: string
          period_end?: string
          period_start?: string
          summary?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ai_processing_consents: {
        Row: {
          granted_at: string
          policy_version: string
          provider: string
          purpose: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          policy_version: string
          provider: string
          purpose: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          policy_version?: string
          provider?: string
          purpose?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          name: string
          note: string | null
          prompt: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          name: string
          note?: string | null
          prompt: string
          version: number
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          name?: string
          note?: string | null
          prompt?: string
          version?: number
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          created_at: string | null
          id: string
          prompt_version: number | null
          source: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          prompt_version?: number | null
          source: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          prompt_version?: number | null
          source?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: []
      }
      cal_sync: {
        Row: {
          cal_email: string
          cal_password_enc: string
          enabled: boolean
          event_count: number | null
          last_status: string | null
          last_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cal_email: string
          cal_password_enc: string
          enabled?: boolean
          event_count?: number | null
          last_status?: string | null
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cal_email?: string
          cal_password_enc?: string
          enabled?: boolean
          event_count?: number | null
          last_status?: string | null
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          description: string | null
          end_ts: string
          id: string
          location: string | null
          source: string | null
          start_ts: string
          title: string
          uid: string
          user_id: string
        }
        Insert: {
          description?: string | null
          end_ts: string
          id?: string
          location?: string | null
          source?: string | null
          start_ts: string
          title: string
          uid: string
          user_id: string
        }
        Update: {
          description?: string | null
          end_ts?: string
          id?: string
          location?: string | null
          source?: string | null
          start_ts?: string
          title?: string
          uid?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          session_id: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          session_id: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          session_id?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          context_snapshot: string | null
          created_at: string | null
          id: string
          period_end: string | null
          period_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context_snapshot?: string | null
          created_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context_snapshot?: string | null
          created_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      claude_usage: {
        Row: {
          id: number
          session_pct: number | null
          session_resets_at: string | null
          updated_at: string | null
          weekly_pct: number | null
          weekly_resets_at: string | null
        }
        Insert: {
          id?: number
          session_pct?: number | null
          session_resets_at?: string | null
          updated_at?: string | null
          weekly_pct?: number | null
          weekly_resets_at?: string | null
        }
        Update: {
          id?: number
          session_pct?: number | null
          session_resets_at?: string | null
          updated_at?: string | null
          weekly_pct?: number | null
          weekly_resets_at?: string | null
        }
        Relationships: []
      }
      coach_events: {
        Row: {
          created_at: string | null
          id: string
          payload: Json | null
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          payload?: Json | null
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json | null
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_profile: {
        Row: {
          enabled: boolean
          facts: Json
          focus: Json | null
          summary: string | null
          tone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          enabled?: boolean
          facts?: Json
          focus?: Json | null
          summary?: string | null
          tone?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          enabled?: boolean
          facts?: Json
          focus?: Json | null
          summary?: string | null
          tone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      codex_usage: {
        Row: {
          id: number
          plan_type: string | null
          session_pct: number | null
          session_resets_at: string | null
          updated_at: string | null
          weekly_pct: number | null
          weekly_resets_at: string | null
        }
        Insert: {
          id: number
          plan_type?: string | null
          session_pct?: number | null
          session_resets_at?: string | null
          updated_at?: string | null
          weekly_pct?: number | null
          weekly_resets_at?: string | null
        }
        Update: {
          id?: number
          plan_type?: string | null
          session_pct?: number | null
          session_resets_at?: string | null
          updated_at?: string | null
          weekly_pct?: number | null
          weekly_resets_at?: string | null
        }
        Relationships: []
      }
      concern_logs: {
        Row: {
          concern_id: string
          created_at: string | null
          date: string
          id: string
          note: string | null
          photo_path: string | null
          severity: number | null
          user_id: string
        }
        Insert: {
          concern_id: string
          created_at?: string | null
          date?: string
          id?: string
          note?: string | null
          photo_path?: string | null
          severity?: number | null
          user_id: string
        }
        Update: {
          concern_id?: string
          created_at?: string | null
          date?: string
          id?: string
          note?: string | null
          photo_path?: string | null
          severity?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concern_logs_concern_id_fkey"
            columns: ["concern_id"]
            isOneToOne: false
            referencedRelation: "health_concerns"
            referencedColumns: ["id"]
          },
        ]
      }
      context_notes: {
        Row: {
          created_at: string | null
          date: string
          id: string
          note: string | null
          updated_at: string | null
          user_id: string
          wellbeing: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          note?: string | null
          updated_at?: string | null
          user_id: string
          wellbeing?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          note?: string | null
          updated_at?: string | null
          user_id?: string
          wellbeing?: number | null
        }
        Relationships: []
      }
      daily_note_settings: {
        Row: {
          enabled: boolean
          last_sent_date: string | null
          time: string
          timezone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          enabled?: boolean
          last_sent_date?: string | null
          time?: string
          timezone?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          enabled?: boolean
          last_sent_date?: string | null
          time?: string
          timezone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_scores: {
        Row: {
          date: string
          hrv_baseline: number | null
          readiness: number | null
          recovery_score: number | null
          rhr_baseline: number | null
          sleep_baseline: number | null
          sleep_score: number | null
          steps_baseline: number | null
          stress_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          date: string
          hrv_baseline?: number | null
          readiness?: number | null
          recovery_score?: number | null
          rhr_baseline?: number | null
          sleep_baseline?: number | null
          sleep_score?: number | null
          steps_baseline?: number | null
          stress_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          date?: string
          hrv_baseline?: number | null
          readiness?: number | null
          recovery_score?: number | null
          rhr_baseline?: number | null
          sleep_baseline?: number | null
          sleep_score?: number | null
          steps_baseline?: number | null
          stress_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      environment_daily: {
        Row: {
          air_quality: number | null
          created_at: string
          date: string
          daylight_minutes: number | null
          id: string
          kp_index: number | null
          pollen: number | null
          precipitation_mm: number | null
          pressure_hpa: number | null
          temp_c: number | null
          user_id: string
        }
        Insert: {
          air_quality?: number | null
          created_at?: string
          date: string
          daylight_minutes?: number | null
          id?: string
          kp_index?: number | null
          pollen?: number | null
          precipitation_mm?: number | null
          pressure_hpa?: number | null
          temp_c?: number | null
          user_id: string
        }
        Update: {
          air_quality?: number | null
          created_at?: string
          date?: string
          daylight_minutes?: number | null
          id?: string
          kp_index?: number | null
          pollen?: number | null
          precipitation_mm?: number | null
          pressure_hpa?: number | null
          temp_c?: number | null
          user_id?: string
        }
        Relationships: []
      }
      experiments: {
        Row: {
          ai_explanation: string | null
          baseline_days: number
          baseline_start: string | null
          change_rule: string
          created_at: string
          end_date: string
          hypothesis: string
          id: string
          result: Json | null
          start_date: string
          status: string
          target_metric: string
          user_id: string
        }
        Insert: {
          ai_explanation?: string | null
          baseline_days?: number
          baseline_start?: string | null
          change_rule: string
          created_at?: string
          end_date: string
          hypothesis: string
          id?: string
          result?: Json | null
          start_date: string
          status?: string
          target_metric: string
          user_id: string
        }
        Update: {
          ai_explanation?: string | null
          baseline_days?: number
          baseline_start?: string | null
          change_rule?: string
          created_at?: string
          end_date?: string
          hypothesis?: string
          id?: string
          result?: Json | null
          start_date?: string
          status?: string
          target_metric?: string
          user_id?: string
        }
        Relationships: []
      }
      football_match_reminders: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          match_id: string
          reminder_type: string
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["football_reminder_status"]
          telegram_message_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          match_id: string
          reminder_type?: string
          scheduled_at: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["football_reminder_status"]
          telegram_message_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          match_id?: string
          reminder_type?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["football_reminder_status"]
          telegram_message_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "football_match_reminders_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "football_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      football_match_responses: {
        Row: {
          id: string
          match_id: string
          responded_at: string
          response: Database["public"]["Enums"]["football_watch_response"]
          telegram_callback_query_id: string | null
          telegram_message_id: number | null
          user_id: string
        }
        Insert: {
          id?: string
          match_id: string
          responded_at?: string
          response: Database["public"]["Enums"]["football_watch_response"]
          telegram_callback_query_id?: string | null
          telegram_message_id?: number | null
          user_id: string
        }
        Update: {
          id?: string
          match_id?: string
          responded_at?: string
          response?: Database["public"]["Enums"]["football_watch_response"]
          telegram_callback_query_id?: string | null
          telegram_message_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "football_match_responses_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "football_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      football_matches: {
        Row: {
          away_team_code: string | null
          away_team_id: number | null
          away_team_logo: string | null
          away_team_name: string
          competition_name: string
          created_at: string
          home_team_code: string | null
          home_team_id: number | null
          home_team_logo: string | null
          home_team_name: string
          id: string
          kickoff_at: string
          league_id: number
          provider: string
          provider_fixture_id: number | null
          raw_payload: Json
          round_name: string | null
          season: number
          short_id: string | null
          status_long: string
          status_short: string
          updated_at: string
          venue_city: string | null
          venue_name: string | null
        }
        Insert: {
          away_team_code?: string | null
          away_team_id?: number | null
          away_team_logo?: string | null
          away_team_name: string
          competition_name: string
          created_at?: string
          home_team_code?: string | null
          home_team_id?: number | null
          home_team_logo?: string | null
          home_team_name: string
          id?: string
          kickoff_at: string
          league_id: number
          provider?: string
          provider_fixture_id?: number | null
          raw_payload?: Json
          round_name?: string | null
          season: number
          short_id?: string | null
          status_long?: string
          status_short?: string
          updated_at?: string
          venue_city?: string | null
          venue_name?: string | null
        }
        Update: {
          away_team_code?: string | null
          away_team_id?: number | null
          away_team_logo?: string | null
          away_team_name?: string
          competition_name?: string
          created_at?: string
          home_team_code?: string | null
          home_team_id?: number | null
          home_team_logo?: string | null
          home_team_name?: string
          id?: string
          kickoff_at?: string
          league_id?: number
          provider?: string
          provider_fixture_id?: number | null
          raw_payload?: Json
          round_name?: string | null
          season?: number
          short_id?: string | null
          status_long?: string
          status_short?: string
          updated_at?: string
          venue_city?: string | null
          venue_name?: string | null
        }
        Relationships: []
      }
      football_user_settings: {
        Row: {
          created_at: string
          reminder_minutes_before: number
          reminders_enabled: boolean
          telegram_chat_id: number
          timezone: string
          updated_at: string
          user_id: string
          watch_all_worldcup: boolean
        }
        Insert: {
          created_at?: string
          reminder_minutes_before?: number
          reminders_enabled?: boolean
          telegram_chat_id: number
          timezone?: string
          updated_at?: string
          user_id: string
          watch_all_worldcup?: boolean
        }
        Update: {
          created_at?: string
          reminder_minutes_before?: number
          reminders_enabled?: boolean
          telegram_chat_id?: number
          timezone?: string
          updated_at?: string
          user_id?: string
          watch_all_worldcup?: boolean
        }
        Relationships: []
      }
      goal_progress: {
        Row: {
          created_at: string | null
          date: string
          goal_id: string
          id: string
          on_target: boolean | null
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          goal_id: string
          id?: string
          on_target?: boolean | null
          user_id: string
          value?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          goal_id?: string
          id?: string
          on_target?: boolean | null
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_progress_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          baseline_value: number | null
          created_at: string | null
          direction: string
          end_date: string
          id: string
          metric: string
          recommendation_id: string | null
          start_date: string
          status: string
          step_size: number | null
          target_value: number
          title: string
          user_id: string
        }
        Insert: {
          baseline_value?: number | null
          created_at?: string | null
          direction: string
          end_date: string
          id?: string
          metric: string
          recommendation_id?: string | null
          start_date?: string
          status?: string
          step_size?: number | null
          target_value: number
          title: string
          user_id: string
        }
        Update: {
          baseline_value?: number | null
          created_at?: string | null
          direction?: string
          end_date?: string
          id?: string
          metric?: string
          recommendation_id?: string | null
          start_date?: string
          status?: string
          step_size?: number | null
          target_value?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      hair_entries: {
        Row: {
          created_at: string | null
          date: string
          density_rating: number | null
          hairline_rating: number | null
          id: string
          notes: string | null
          photo_hairline: string | null
          photo_temples: string | null
          photo_top: string | null
          scalp_note: string | null
          shedding_level: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          density_rating?: number | null
          hairline_rating?: number | null
          id?: string
          notes?: string | null
          photo_hairline?: string | null
          photo_temples?: string | null
          photo_top?: string | null
          scalp_note?: string | null
          shedding_level?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          density_rating?: number | null
          hairline_rating?: number | null
          id?: string
          notes?: string | null
          photo_hairline?: string | null
          photo_temples?: string | null
          photo_top?: string | null
          scalp_note?: string | null
          shedding_level?: number | null
          user_id?: string
        }
        Relationships: []
      }
      health_alerts: {
        Row: {
          acknowledged_at: string | null
          created_at: string | null
          date: string | null
          findings: Json | null
          id: string
          level: string | null
          message: string | null
          type: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string | null
          date?: string | null
          findings?: Json | null
          id?: string
          level?: string | null
          message?: string | null
          type: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string | null
          date?: string | null
          findings?: Json | null
          id?: string
          level?: string | null
          message?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      health_concerns: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_private: boolean
          name: string
          notes: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          is_private?: boolean
          name: string
          notes?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_private?: boolean
          name?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      heart_rate_samples: {
        Row: {
          bpm: number
          id: string
          source: string | null
          ts: string
          user_id: string
        }
        Insert: {
          bpm: number
          id?: string
          source?: string | null
          ts: string
          user_id: string
        }
        Update: {
          bpm?: number
          id?: string
          source?: string | null
          ts?: string
          user_id?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      imports: {
        Row: {
          filename: string
          id: string
          imported_at: string | null
          period_end: string | null
          period_start: string | null
          records_added: number | null
          user_id: string
        }
        Insert: {
          filename: string
          id?: string
          imported_at?: string | null
          period_end?: string | null
          period_start?: string | null
          records_added?: number | null
          user_id: string
        }
        Update: {
          filename?: string
          id?: string
          imported_at?: string | null
          period_end?: string | null
          period_start?: string | null
          records_added?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ingest_raw: {
        Row: {
          id: string
          payload: Json | null
          received_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          payload?: Json | null
          received_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          payload?: Json | null
          received_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ingest_tokens: {
        Row: {
          created_at: string | null
          last_ingest_at: string | null
          last_status: string | null
          mode: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          last_ingest_at?: string | null
          last_status?: string | null
          mode?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          last_ingest_at?: string | null
          last_status?: string | null
          mode?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      intake_events: {
        Row: {
          amount: number | null
          calories: number | null
          carbs_g: number | null
          created_at: string | null
          fat_g: number | null
          id: string
          note: string | null
          protein_g: number | null
          ts: string
          type: string
          unit: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string | null
          fat_g?: number | null
          id?: string
          note?: string | null
          protein_g?: number | null
          ts: string
          type: string
          unit?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string | null
          fat_g?: number | null
          id?: string
          note?: string | null
          protein_g?: number | null
          ts?: string
          type?: string
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lab_files: {
        Row: {
          created_at: string | null
          date: string | null
          extracted_text: string | null
          file_name: string
          file_path: string | null
          file_type: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          extracted_text?: string | null
          file_name: string
          file_path?: string | null
          file_type?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string | null
          extracted_text?: string | null
          file_name?: string
          file_path?: string | null
          file_type?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      lab_results: {
        Row: {
          created_at: string | null
          date: string
          flag: string | null
          id: string
          lab_file_id: string
          marker: string
          ref_range: string | null
          unit: string | null
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          flag?: string | null
          id?: string
          lab_file_id: string
          marker: string
          ref_range?: string | null
          unit?: string | null
          user_id: string
          value?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          flag?: string | null
          id?: string
          lab_file_id?: string
          marker?: string
          ref_range?: string | null
          unit?: string | null
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_lab_file_id_fkey"
            columns: ["lab_file_id"]
            isOneToOne: false
            referencedRelation: "lab_files"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics_daily: {
        Row: {
          avg_val: number | null
          count_val: number | null
          date: string
          id: string
          json_val: Json | null
          max_val: number | null
          metric: string
          min_val: number | null
          sum_val: number | null
          user_id: string
        }
        Insert: {
          avg_val?: number | null
          count_val?: number | null
          date: string
          id?: string
          json_val?: Json | null
          max_val?: number | null
          metric: string
          min_val?: number | null
          sum_val?: number | null
          user_id: string
        }
        Update: {
          avg_val?: number | null
          count_val?: number | null
          date?: string
          id?: string
          json_val?: Json | null
          max_val?: number | null
          metric?: string
          min_val?: number | null
          sum_val?: number | null
          user_id?: string
        }
        Relationships: []
      }
      metrics_daily_staging: {
        Row: {
          avg_val: number | null
          date: string
          max_val: number | null
          metric: string
          min_val: number | null
          sum_val: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_val?: number | null
          date: string
          max_val?: number | null
          metric: string
          min_val?: number | null
          sum_val?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_val?: number | null
          date?: string
          max_val?: number | null
          metric?: string
          min_val?: number | null
          sum_val?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      observability_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          environment: string
          error_code: string | null
          event_timestamp: string
          id: string
          operation: string
          outcome: string
          release: string
          request_id: string
          service: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          environment: string
          error_code?: string | null
          event_timestamp: string
          id?: string
          operation: string
          outcome: string
          release: string
          request_id: string
          service: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          environment?: string
          error_code?: string | null
          event_timestamp?: string
          id?: string
          operation?: string
          outcome?: string
          release?: string
          request_id?: string
          service?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_budget_usd: number | null
          birth_year: number | null
          created_at: string | null
          id: string
          latitude: number | null
          location_label: string | null
          longitude: number | null
          privacy_pin_hash: string | null
          sex: string | null
          timezone: string | null
        }
        Insert: {
          ai_budget_usd?: number | null
          birth_year?: number | null
          created_at?: string | null
          id: string
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          privacy_pin_hash?: string | null
          sex?: string | null
          timezone?: string | null
        }
        Update: {
          ai_budget_usd?: number | null
          birth_year?: number | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          privacy_pin_hash?: string | null
          sex?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          created_at: string | null
          id: string
          metric: string
          rationale: string | null
          source: string | null
          status: string
          suggested_target: number | null
          suggested_target_label: string | null
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metric: string
          rationale?: string | null
          source?: string | null
          status?: string
          suggested_target?: number | null
          suggested_target_label?: string | null
          text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metric?: string
          rationale?: string | null
          source?: string | null
          status?: string
          suggested_target?: number | null
          suggested_target_label?: string | null
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      reminder_events: {
        Row: {
          attempt_count: number
          claim_token: string | null
          claimed_at: string | null
          created_at: string | null
          due_at: string
          id: string
          last_error: string | null
          responded_at: string | null
          sent_at: string | null
          snooze_until: string | null
          status: string
          supplement_id: string
          tg_message_id: number | null
          user_id: string
        }
        Insert: {
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string | null
          due_at: string
          id?: string
          last_error?: string | null
          responded_at?: string | null
          sent_at?: string | null
          snooze_until?: string | null
          status?: string
          supplement_id: string
          tg_message_id?: number | null
          user_id: string
        }
        Update: {
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string | null
          due_at?: string
          id?: string
          last_error?: string | null
          responded_at?: string | null
          sent_at?: string | null
          snooze_until?: string | null
          status?: string
          supplement_id?: string
          tg_message_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_events_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_settings: {
        Row: {
          created_at: string | null
          enabled: boolean
          id: string
          quiet_until: string | null
          snooze_options: number[]
          supplement_id: string
          times: string[]
          timezone: string
          updated_at: string | null
          user_id: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          quiet_until?: string | null
          snooze_options?: number[]
          supplement_id: string
          times?: string[]
          timezone?: string
          updated_at?: string | null
          user_id: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          quiet_until?: string | null
          snooze_options?: number[]
          supplement_id?: string
          times?: string[]
          timezone?: string
          updated_at?: string | null
          user_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "reminder_settings_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      report_settings: {
        Row: {
          detail_level: string
          frequency_days: number | null
          morning_last_sent: string | null
          morning_summary: boolean
          morning_time: string
          next_report_at: string | null
          paused: boolean | null
          send_sensitive: boolean
          timezone: string
          user_id: string
        }
        Insert: {
          detail_level?: string
          frequency_days?: number | null
          morning_last_sent?: string | null
          morning_summary?: boolean
          morning_time?: string
          next_report_at?: string | null
          paused?: boolean | null
          send_sensitive?: boolean
          timezone?: string
          user_id: string
        }
        Update: {
          detail_level?: string
          frequency_days?: number | null
          morning_last_sent?: string | null
          morning_summary?: boolean
          morning_time?: string
          next_report_at?: string | null
          paused?: boolean | null
          send_sensitive?: boolean
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      research_runs: {
        Row: {
          created_at: string | null
          findings: Json
          id: string
          period_days: number
          reply: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          findings?: Json
          id?: string
          period_days: number
          reply?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          findings?: Json
          id?: string
          period_days?: number
          reply?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scheduled_reports: {
        Row: {
          channel: string | null
          content: string
          created_at: string | null
          delivered_at: string | null
          id: string
          period_end: string
          period_start: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          content: string
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          period_end: string
          period_start: string
          user_id: string
        }
        Update: {
          channel?: string | null
          content?: string
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          user_id?: string
        }
        Relationships: []
      }
      sleep_sessions: {
        Row: {
          bedtime: string | null
          core_hours: number | null
          date: string
          deep_hours: number | null
          duration_hours: number | null
          id: string
          rem_hours: number | null
          user_id: string
          wake_time: string | null
        }
        Insert: {
          bedtime?: string | null
          core_hours?: number | null
          date: string
          deep_hours?: number | null
          duration_hours?: number | null
          id?: string
          rem_hours?: number | null
          user_id: string
          wake_time?: string | null
        }
        Update: {
          bedtime?: string | null
          core_hours?: number | null
          date?: string
          deep_hours?: number | null
          duration_hours?: number | null
          id?: string
          rem_hours?: number | null
          user_id?: string
          wake_time?: string | null
        }
        Relationships: []
      }
      sleep_sessions_staging: {
        Row: {
          bedtime: string | null
          core_hours: number | null
          date: string
          deep_hours: number | null
          duration_hours: number | null
          rem_hours: number | null
          updated_at: string | null
          user_id: string
          wake_time: string | null
        }
        Insert: {
          bedtime?: string | null
          core_hours?: number | null
          date: string
          deep_hours?: number | null
          duration_hours?: number | null
          rem_hours?: number | null
          updated_at?: string | null
          user_id: string
          wake_time?: string | null
        }
        Update: {
          bedtime?: string | null
          core_hours?: number | null
          date?: string
          deep_hours?: number | null
          duration_hours?: number | null
          rem_hours?: number | null
          updated_at?: string | null
          user_id?: string
          wake_time?: string | null
        }
        Relationships: []
      }
      supplement_logs: {
        Row: {
          created_at: string | null
          date: string
          dose: string | null
          id: string
          note: string | null
          supplement_id: string
          taken: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          dose?: string | null
          id?: string
          note?: string | null
          supplement_id: string
          taken?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          dose?: string | null
          id?: string
          note?: string | null
          supplement_id?: string
          taken?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplement_logs_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplements: {
        Row: {
          active: boolean | null
          created_at: string | null
          default_dose: string | null
          id: string
          name: string
          sort_order: number | null
          stock_count: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          default_dose?: string | null
          id?: string
          name: string
          sort_order?: number | null
          stock_count?: number | null
          unit?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          default_dose?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          stock_count?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          awaiting_note_date: string | null
          id: string
          linked_at: string | null
          status: string
          telegram_chat_id: string
          telegram_username: string | null
          tg_session_id: string | null
          user_id: string
        }
        Insert: {
          awaiting_note_date?: string | null
          id?: string
          linked_at?: string | null
          status?: string
          telegram_chat_id: string
          telegram_username?: string | null
          tg_session_id?: string | null
          user_id: string
        }
        Update: {
          awaiting_note_date?: string | null
          id?: string
          linked_at?: string | null
          status?: string
          telegram_chat_id?: string
          telegram_username?: string | null
          tg_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      treatments: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          outcome_metrics: string[] | null
          started_at: string
          supplement_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          outcome_metrics?: string[] | null
          started_at: string
          supplement_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          outcome_metrics?: string[] | null
          started_at?: string
          supplement_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_tokens: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_schedule: {
        Row: {
          created_at: string | null
          day_times: Json
          enabled: boolean
          last_notified_date: string | null
          notify_hours_before: number
          time: string
          timezone: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string | null
          day_times?: Json
          enabled?: boolean
          last_notified_date?: string | null
          notify_hours_before?: number
          time?: string
          timezone?: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string | null
          day_times?: Json
          enabled?: boolean
          last_notified_date?: string | null
          notify_hours_before?: number
          time?: string
          timezone?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
    }
    Views: {
      daily_metrics: {
        Row: {
          active_energy: number | null
          date: string | null
          hrv: number | null
          oxygen_saturation: number | null
          respiratory_rate: number | null
          resting_heart_rate: number | null
          sleep_hours: number | null
          steps: number | null
          user_id: string | null
          wrist_temperature: number | null
        }
        Relationships: []
      }
      daily_summary: {
        Row: {
          active_energy: number | null
          date: string | null
          hrv: number | null
          oxygen_saturation: number | null
          resting_heart_rate: number | null
          sleep_hours: number | null
          steps: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_due_football_reminders: {
        Args: never
        Returns: {
          away_team_name: string
          competition_name: string
          home_team_name: string
          kickoff_at: string
          match_id: string
          match_short_id: string
          reminder_id: string
          round_name: string
          telegram_chat_id: number
          timezone: string
          user_id: string
          venue_city: string
          venue_name: string
        }[]
      }
      claim_due_reminder_events: {
        Args: {
          p_lease_minutes?: number
          p_limit?: number
          p_max_attempts?: number
        }
        Returns: {
          attempt_count: number
          claim_token: string
          default_dose: string
          due_at: string
          id: string
          supplement_id: string
          supplement_name: string
          telegram_chat_id: string
          timezone: string
          unit: string
          user_id: string
        }[]
      }
      complete_reminder_delivery: {
        Args: {
          p_claim_token: string
          p_event_id: string
          p_status?: string
          p_telegram_message_id?: number
        }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      fail_reminder_delivery: {
        Args: {
          p_claim_token: string
          p_error: string
          p_event_id: string
          p_max_attempts?: number
          p_unknown?: boolean
        }
        Returns: boolean
      }
      generate_football_reminders: { Args: never; Returns: number }
      mark_football_reminder_failed: {
        Args: { p_error_message: string; p_reminder_id: string }
        Returns: undefined
      }
      mark_football_reminder_sent: {
        Args: { p_reminder_id: string; p_telegram_message_id: number }
        Returns: undefined
      }
      schedule_env_sync: { Args: { p_secret: string }; Returns: undefined }
    }
    Enums: {
      football_reminder_status:
        | "pending"
        | "processing"
        | "sent"
        | "skipped"
        | "failed"
        | "cancelled"
      football_watch_response: "watching" | "not_watching"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      football_reminder_status: [
        "pending",
        "processing",
        "sent",
        "skipped",
        "failed",
        "cancelled",
      ],
      football_watch_response: ["watching", "not_watching"],
    },
  },
} as const

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; timezone: string | null; created_at: string }
        Insert: { id: string; timezone?: string | null }
        Update: { timezone?: string | null }
      }
      imports: {
        Row: {
          id: string
          user_id: string
          filename: string
          period_start: string | null
          period_end: string | null
          records_added: number
          imported_at: string
        }
        Insert: {
          user_id: string
          filename: string
          period_start?: string | null
          period_end?: string | null
          records_added?: number
        }
        Update: Record<string, never>
      }
      metrics_daily: {
        Row: {
          id: string
          user_id: string
          date: string
          metric: string
          avg_val: number | null
          min_val: number | null
          max_val: number | null
          sum_val: number | null
          count_val: number | null
          json_val: Json | null
        }
        Insert: {
          user_id: string
          date: string
          metric: string
          avg_val?: number | null
          min_val?: number | null
          max_val?: number | null
          sum_val?: number | null
          count_val?: number | null
          json_val?: Json | null
        }
        Update: {
          avg_val?: number | null
          min_val?: number | null
          max_val?: number | null
          sum_val?: number | null
          count_val?: number | null
          json_val?: Json | null
        }
      }
      sleep_sessions: {
        Row: {
          id: string
          user_id: string
          date: string
          bedtime: string | null
          wake_time: string | null
          duration_hours: number | null
          deep_hours: number | null
          rem_hours: number | null
          core_hours: number | null
        }
        Insert: {
          user_id: string
          date: string
          bedtime?: string | null
          wake_time?: string | null
          duration_hours?: number | null
          deep_hours?: number | null
          rem_hours?: number | null
          core_hours?: number | null
        }
        Update: {
          bedtime?: string | null
          wake_time?: string | null
          duration_hours?: number | null
          deep_hours?: number | null
          rem_hours?: number | null
          core_hours?: number | null
        }
      }
      intake_events: {
        Row: {
          id: string
          user_id: string
          ts: string
          type: string
          amount: number | null
          unit: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          ts: string
          type: string
          amount?: number | null
          unit?: string | null
          note?: string | null
        }
        Update: {
          amount?: number | null
          unit?: string | null
          note?: string | null
        }
      }
    }
  }
}

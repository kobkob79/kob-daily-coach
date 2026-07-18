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
      ai_memory: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      body_photos: {
        Row: {
          created_at: string
          distance_notes: string | null
          general_notes: string | null
          id: string
          image_path: string
          lighting_notes: string | null
          taken_at: string
          updated_at: string
          user_id: string
          view_angle: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          distance_notes?: string | null
          general_notes?: string | null
          id?: string
          image_path: string
          lighting_notes?: string | null
          taken_at?: string
          updated_at?: string
          user_id: string
          view_angle: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          distance_notes?: string | null
          general_notes?: string | null
          id?: string
          image_path?: string
          lighting_notes?: string | null
          taken_at?: string
          updated_at?: string
          user_id?: string
          view_angle?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      daily_events: {
        Row: {
          amount: number | null
          biological_day: string | null
          created_at: string
          emoji: string | null
          event_date: string
          event_time: string
          id: string
          kind: string
          label: string | null
          meta: Json
          notes: string | null
          unit: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          biological_day?: string | null
          created_at?: string
          emoji?: string | null
          event_date?: string
          event_time?: string
          id?: string
          kind: string
          label?: string | null
          meta?: Json
          notes?: string | null
          unit?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          biological_day?: string | null
          created_at?: string
          emoji?: string | null
          event_date?: string
          event_time?: string
          id?: string
          kind?: string
          label?: string | null
          meta?: Json
          notes?: string | null
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_notes: {
        Row: {
          created_at: string
          date: string
          energy: number | null
          id: string
          mood: number | null
          notes: string | null
          sleep_hours: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          energy?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          sleep_hours?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          energy?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          sleep_hours?: number | null
          user_id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          category: Database["public"]["Enums"]["exercise_category"]
          created_at: string
          default_reps: number | null
          default_sets: number | null
          description: string | null
          equipment: string | null
          id: string
          image_path: string | null
          muscle_group: string | null
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          default_reps?: number | null
          default_sets?: number | null
          description?: string | null
          equipment?: string | null
          id?: string
          image_path?: string | null
          muscle_group?: string | null
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          default_reps?: number | null
          default_sets?: number | null
          description?: string | null
          equipment?: string | null
          id?: string
          image_path?: string | null
          muscle_group?: string | null
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      health_logs: {
        Row: {
          area: Database["public"]["Enums"]["body_area"]
          created_at: string
          date: string
          exercises_done: string | null
          id: string
          mobility_score: number | null
          notes: string | null
          pain_level: number | null
          user_id: string
        }
        Insert: {
          area: Database["public"]["Enums"]["body_area"]
          created_at?: string
          date?: string
          exercises_done?: string | null
          id?: string
          mobility_score?: number | null
          notes?: string | null
          pain_level?: number | null
          user_id: string
        }
        Update: {
          area?: Database["public"]["Enums"]["body_area"]
          created_at?: string
          date?: string
          exercises_done?: string | null
          id?: string
          mobility_score?: number | null
          notes?: string | null
          pain_level?: number | null
          user_id?: string
        }
        Relationships: []
      }
      meal_favorites: {
        Row: {
          calories: number | null
          carbs_g: number | null
          created_at: string
          default_meal_type: string | null
          emoji: string | null
          fat_g: number | null
          id: string
          name: string
          protein_g: number | null
          sort_order: number
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          default_meal_type?: string | null
          emoji?: string | null
          fat_g?: number | null
          id?: string
          name: string
          protein_g?: number | null
          sort_order?: number
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          default_meal_type?: string | null
          emoji?: string | null
          fat_g?: number | null
          id?: string
          name?: string
          protein_g?: number | null
          sort_order?: number
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      nutrition_entries: {
        Row: {
          biological_day: string | null
          calories: number | null
          carbs_g: number | null
          created_at: string
          date: string
          fat_g: number | null
          fiber_g: number | null
          food_name: string
          foods: Json
          id: string
          location: string | null
          meal: Database["public"]["Enums"]["meal_type"]
          meal_time: string | null
          meal_type: string | null
          notes: string | null
          photo_url: string | null
          protein_g: number | null
          source: string
          user_id: string
        }
        Insert: {
          biological_day?: string | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          date?: string
          fat_g?: number | null
          fiber_g?: number | null
          food_name: string
          foods?: Json
          id?: string
          location?: string | null
          meal: Database["public"]["Enums"]["meal_type"]
          meal_time?: string | null
          meal_type?: string | null
          notes?: string | null
          photo_url?: string | null
          protein_g?: number | null
          source?: string
          user_id: string
        }
        Update: {
          biological_day?: string | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          date?: string
          fat_g?: number | null
          fiber_g?: number | null
          food_name?: string
          foods?: Json
          id?: string
          location?: string | null
          meal?: Database["public"]["Enums"]["meal_type"]
          meal_time?: string | null
          meal_type?: string | null
          notes?: string | null
          photo_url?: string | null
          protein_g?: number | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string | null
          avatar_url: string | null
          birth_date: string | null
          calorie_target: number | null
          created_at: string
          current_weight_kg: number | null
          display_name: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          height_cm: number | null
          id: string
          job_title: string | null
          life_context: string | null
          onboarding_completed_at: string | null
          onboarding_step: number
          personal_notes: string | null
          protein_target_g: number | null
          target_weight_kg: number | null
          updated_at: string
          water_target_ml: number | null
          work_type: string | null
          workplace: string | null
        }
        Insert: {
          activity_level?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          calorie_target?: number | null
          created_at?: string
          current_weight_kg?: number | null
          display_name?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          height_cm?: number | null
          id: string
          job_title?: string | null
          life_context?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          personal_notes?: string | null
          protein_target_g?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          water_target_ml?: number | null
          work_type?: string | null
          workplace?: string | null
        }
        Update: {
          activity_level?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          calorie_target?: number | null
          created_at?: string
          current_weight_kg?: number | null
          display_name?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          job_title?: string | null
          life_context?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          personal_notes?: string | null
          protein_target_g?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          water_target_ml?: number | null
          work_type?: string | null
          workplace?: string | null
        }
        Relationships: []
      }
      shift_config: {
        Row: {
          anchor_date: string
          anchor_shift: Database["public"]["Enums"]["shift_type"]
          cycle_length: number | null
          day_shifts: number | null
          night_shifts: number | null
          off_days: number | null
          pattern: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_date: string
          anchor_shift?: Database["public"]["Enums"]["shift_type"]
          cycle_length?: number | null
          day_shifts?: number | null
          night_shifts?: number | null
          off_days?: number | null
          pattern?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_date?: string
          anchor_shift?: Database["public"]["Enums"]["shift_type"]
          cycle_length?: number | null
          day_shifts?: number | null
          night_shifts?: number | null
          off_days?: number | null
          pattern?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vision_captures: {
        Row: {
          ai_status: string
          capture_type: string
          captured_at: string
          created_at: string
          extracted: Json
          id: string
          image_path: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_status?: string
          capture_type: string
          captured_at?: string
          created_at?: string
          extracted?: Json
          id?: string
          image_path?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_status?: string
          capture_type?: string
          captured_at?: string
          created_at?: string
          extracted?: Json
          id?: string
          image_path?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_plans: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          template_id: string | null
          updated_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          template_id?: string | null
          updated_at?: string
          user_id: string
          weekday: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          created_at: string
          difficulty: number | null
          duration_seconds: number | null
          edited_at: string | null
          energy: number | null
          finished_at: string | null
          id: string
          name: string | null
          notes: string | null
          pain: string | null
          started_at: string
          status: string
          template_id: string | null
          total_volume_kg: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          duration_seconds?: number | null
          edited_at?: string | null
          energy?: number | null
          finished_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          pain?: string | null
          started_at?: string
          status?: string
          template_id?: string | null
          total_volume_kg?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          duration_seconds?: number | null
          edited_at?: string | null
          energy?: number | null
          finished_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          pain?: string | null
          started_at?: string
          status?: string
          template_id?: string | null
          total_volume_kg?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          actual_rest_seconds: number | null
          completed_at: string | null
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          overtime_seconds: number | null
          planned_rest_seconds: number | null
          position: number | null
          reps: number | null
          rpe: number | null
          session_id: string | null
          set_number: number
          user_id: string
          weight_kg: number | null
          workout_id: string | null
        }
        Insert: {
          actual_rest_seconds?: number | null
          completed_at?: string | null
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          overtime_seconds?: number | null
          planned_rest_seconds?: number | null
          position?: number | null
          reps?: number | null
          rpe?: number | null
          session_id?: string | null
          set_number?: number
          user_id: string
          weight_kg?: number | null
          workout_id?: string | null
        }
        Update: {
          actual_rest_seconds?: number | null
          completed_at?: string | null
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          overtime_seconds?: number | null
          planned_rest_seconds?: number | null
          position?: number | null
          reps?: number | null
          rpe?: number | null
          session_id?: string | null
          set_number?: number
          user_id?: string
          weight_kg?: number | null
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_template_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          position: number
          target_reps: number | null
          target_sets: number
          target_weight_kg: number | null
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          position?: number
          target_reps?: number | null
          target_sets?: number
          target_weight_kg?: number | null
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          position?: number
          target_reps?: number | null
          target_sets?: number
          target_weight_kg?: number | null
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_template_exercises_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          created_at: string
          date: string
          duration_min: number | null
          id: string
          name: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          duration_min?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          duration_min?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      body_area: "neck" | "sciatica" | "ac_joint" | "general"
      exercise_category:
        | "push"
        | "pull"
        | "legs"
        | "core"
        | "mobility"
        | "conditioning"
      meal_type: "breakfast" | "lunch" | "dinner" | "snack"
      shift_type: "day" | "night" | "off"
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
      body_area: ["neck", "sciatica", "ac_joint", "general"],
      exercise_category: [
        "push",
        "pull",
        "legs",
        "core",
        "mobility",
        "conditioning",
      ],
      meal_type: ["breakfast", "lunch", "dinner", "snack"],
      shift_type: ["day", "night", "off"],
    },
  },
} as const

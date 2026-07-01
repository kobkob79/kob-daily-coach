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
          muscle_group: string | null
          name: string
          owner_id: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          default_reps?: number | null
          default_sets?: number | null
          description?: string | null
          equipment?: string | null
          id?: string
          muscle_group?: string | null
          name: string
          owner_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          default_reps?: number | null
          default_sets?: number | null
          description?: string | null
          equipment?: string | null
          id?: string
          muscle_group?: string | null
          name?: string
          owner_id?: string | null
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
      nutrition_entries: {
        Row: {
          calories: number | null
          carbs_g: number | null
          created_at: string
          date: string
          fat_g: number | null
          food_name: string
          id: string
          meal: Database["public"]["Enums"]["meal_type"]
          notes: string | null
          protein_g: number | null
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          date?: string
          fat_g?: number | null
          food_name: string
          id?: string
          meal: Database["public"]["Enums"]["meal_type"]
          notes?: string | null
          protein_g?: number | null
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          date?: string
          fat_g?: number | null
          food_name?: string
          id?: string
          meal?: Database["public"]["Enums"]["meal_type"]
          notes?: string | null
          protein_g?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_config: {
        Row: {
          anchor_date: string
          anchor_shift: Database["public"]["Enums"]["shift_type"]
          pattern: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_date: string
          anchor_shift?: Database["public"]["Enums"]["shift_type"]
          pattern?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_date?: string
          anchor_shift?: Database["public"]["Enums"]["shift_type"]
          pattern?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          reps: number | null
          rpe: number | null
          set_number: number
          user_id: string
          weight_kg: number | null
          workout_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number
          user_id: string
          weight_kg?: number | null
          workout_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number
          user_id?: string
          weight_kg?: number | null
          workout_id?: string
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
            foreignKeyName: "workout_sets_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
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

/**
 * Domain types for Viora. Derived from the database schema so they can never
 * drift from the real tables.
 */
import type { Row, Insert, Update } from "./database";

export type Profile = Row<"profiles">;
export type ProfileUpdate = Update<"profiles">;

export type Exercise = Row<"exercises">;
export type ExerciseInsert = Insert<"exercises">;

/** Reusable workout program (stored as `workout_templates`). */
export type WorkoutProgram = Row<"workout_templates">;
export type WorkoutProgramInsert = Insert<"workout_templates">;

/** A weekday slot inside a program (stored as `workout_plans`). */
export type ProgramDay = Row<"workout_plans">;
export type ProgramDayInsert = Insert<"workout_plans">;

/** An exercise inside a program (stored as `workout_template_exercises`). */
export type ProgramExercise = Row<"workout_template_exercises">;
export type ProgramExerciseInsert = Insert<"workout_template_exercises">;

export type WorkoutSession = Row<"workout_sessions">;
export type WorkoutSessionInsert = Insert<"workout_sessions">;
export type WorkoutSessionUpdate = Update<"workout_sessions">;

export type WorkoutSet = Row<"workout_sets">;
export type WorkoutSetInsert = Insert<"workout_sets">;

export type BodyMeasurement = Row<"body_measurements">;
export type BodyMeasurementInsert = Insert<"body_measurements">;

export type WeightEntry = Row<"weights_history">;
export type WeightEntryInsert = Insert<"weights_history">;

export type Goal = Row<"goals">;
export type GoalInsert = Insert<"goals">;
export type GoalUpdate = Update<"goals">;

export type AiRecommendation = Row<"ai_recommendations">;
export type AiRecommendationInsert = Insert<"ai_recommendations">;

export * from "./database";

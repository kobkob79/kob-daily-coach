export const EXERCISE_INSIGHT_MAX_LENGTH = 160;

export const EXERCISE_INSIGHT_CATEGORIES = [
  "machine_setup",
  "working_weight",
  "technique",
  "pain_sensitivity",
  "range_of_motion",
  "other",
] as const;

export type ExerciseInsightCategory = (typeof EXERCISE_INSIGHT_CATEGORIES)[number];

export interface ExerciseInsight {
  id: string;
  category: ExerciseInsightCategory;
  text: string;
}

export const EXERCISE_INSIGHT_CATEGORY_LABELS: Record<ExerciseInsightCategory, string> = {
  machine_setup: "התאמת מכשיר",
  working_weight: "משקל עבודה",
  technique: "טכניקה",
  pain_sensitivity: "כאב או רגישות",
  range_of_motion: "טווח תנועה",
  other: "הערה אחרת",
};

export type ExerciseInsightValidation =
  { valid: true; value: string } | { valid: false; error: string };

export function validateExerciseInsightText(value: string): ExerciseInsightValidation {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: "יש לכתוב תובנה לפני השמירה" };
  }
  if (trimmed.length > EXERCISE_INSIGHT_MAX_LENGTH) {
    return {
      valid: false,
      error: `אפשר לכתוב עד ${EXERCISE_INSIGHT_MAX_LENGTH} תווים`,
    };
  }
  return { valid: true, value: trimmed };
}

export function addExerciseInsight(
  insights: readonly ExerciseInsight[],
  insight: ExerciseInsight,
): ExerciseInsight[] {
  if (insights.some((item) => item.id === insight.id)) {
    throw new Error(`Exercise insight ID already exists: ${insight.id}`);
  }
  return [...insights, insight];
}

export function editExerciseInsight(
  insights: readonly ExerciseInsight[],
  updated: ExerciseInsight,
): ExerciseInsight[] {
  if (!insights.some((item) => item.id === updated.id)) {
    throw new Error(`Exercise insight ID was not found: ${updated.id}`);
  }
  return insights.map((item) => (item.id === updated.id ? updated : item));
}

export function deleteExerciseInsight(
  insights: readonly ExerciseInsight[],
  insightId: string,
): ExerciseInsight[] {
  return insights.filter((item) => item.id !== insightId);
}

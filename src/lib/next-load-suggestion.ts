export interface PreviousSetForSuggestion {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface LoadSuggestion {
  weightKg: number;
  reps: number;
  reason: string; // Hebrew, short, specific — no generic hype
}

export function suggestNextLoad(previous: PreviousSetForSuggestion | null): LoadSuggestion | null {
  if (previous === null || previous.weightKg === null || previous.reps === null) {
    return null;
  }

  if (previous.rpe === null) {
    return {
      weightKg: previous.weightKg,
      reps: previous.reps,
      reason: "בצע את אותו עומס כמו בפעם הקודמת",
    };
  }

  if (previous.rpe <= 7) {
    return {
      weightKg: previous.weightKg + 2.5,
      reps: previous.reps,
      reason: `הרגיש קל בפעם הקודמת (RPE ${previous.rpe}) — נסה להוסיף 2.5 ק"ג`,
    };
  }

  if (previous.rpe > 7 && previous.rpe < 9) {
    return {
      weightKg: previous.weightKg,
      reps: previous.reps,
      reason: `מאמץ טוב בפעם הקודמת (RPE ${previous.rpe}) — שמור על אותו עומס`,
    };
  }

  // previous.rpe >= 9
  return {
    weightKg: previous.weightKg,
    reps: previous.reps,
    reason: `היה קרוב לכשל בפעם הקודמת (RPE ${previous.rpe}) — שמור על אותו משקל, התמקד בטכניקה`,
  };
}

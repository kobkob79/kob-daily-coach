import type { AdvisorContextFlag } from "../../advisor-conversations.ts";

export const ADVISOR_CONTEXT_MAX_CHARS = 12_000;

const FACT_PRIORITY = [
  "limitations",
  "medical",
  "goals",
  "bioDay",
  "shift",
  "sleep",
  "recovery",
  "workouts",
  "nutrition",
  "hydration",
  "progress",
  "profile",
] as const;

type HistoryMessage = { role: "user" | "assistant"; content: string };

function size(value: unknown): number {
  return JSON.stringify(value).length;
}

/** Deterministic, record-atomic budgeting. Complete turns are kept or dropped together. */
export function budgetAdvisorRequestContext(
  context: { generatedAt: string; facts: Record<string, unknown> },
  history: readonly HistoryMessage[],
  maxChars = ADVISOR_CONTEXT_MAX_CHARS,
): {
  context: { generatedAt: string; facts: Record<string, unknown> };
  history: HistoryMessage[];
  truncated: boolean;
} {
  const facts: Record<string, unknown> = {};
  let used = size({ generatedAt: context.generatedAt, facts });
  let truncated = false;

  for (const key of FACT_PRIORITY) {
    if (!(key in context.facts)) continue;
    const candidate = { [key]: context.facts[key] };
    const cost = size(candidate);
    if (used + cost <= maxChars) {
      facts[key] = context.facts[key];
      used += cost;
    } else truncated = true;
  }

  const turns: HistoryMessage[][] = [];
  for (let index = 0; index + 1 < history.length; index += 2) {
    const turn = [history[index], history[index + 1]];
    if (turn[0]?.role === "user" && turn[1]?.role === "assistant") turns.push(turn);
  }
  const kept: HistoryMessage[][] = [];
  for (const turn of [...turns].reverse()) {
    const cost = size(turn);
    if (used + cost <= maxChars) {
      kept.unshift(turn);
      used += cost;
    } else truncated = true;
  }

  return {
    context: { generatedAt: context.generatedAt, facts },
    history: kept.flat(),
    truncated,
  };
}

export function withBudgetFlag(
  flags: readonly AdvisorContextFlag[],
  truncated: boolean,
): AdvisorContextFlag[] {
  return truncated ? [...flags, { key: "contextBudget", state: "limited" }] : [...flags];
}

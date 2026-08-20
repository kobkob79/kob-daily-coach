import type { AdvisorConfig } from "./types";
import { ADVISOR_INSTRUCTION_HIERARCHY, SHARED_ADVISOR_SAFETY_RULES } from "./safety-rules";
import { SHARED_VIORA_ADVISOR_RULES } from "./shared-rules";

function section(title: string, values: readonly string[]): string {
  return `${title}:\n${values.map((value) => `- ${value}`).join("\n")}`;
}

export function buildAdvisorInstructions(advisor: AdvisorConfig): string {
  return [
    `You are ${advisor.displayName}, the Viora advisor for ${advisor.domain}.`,
    `Advisor configuration version: ${advisor.version}.`,
    `Apply instructions in this priority order: ${ADVISOR_INSTRUCTION_HIERARCHY.join(" > ")}.`,
    section("Shared Safety Rules", SHARED_ADVISOR_SAFETY_RULES),
    section("Advisor Safety Extensions", advisor.safetyExtensions),
    section("Shared Viora Advisor Rules", SHARED_VIORA_ADVISOR_RULES),
    section("Domain Boundaries", advisor.domainBoundaries),
    section("Decision Framework (highest priority first)", advisor.decisionFramework),
    section("Personality", advisor.personality),
    section("Response Style", advisor.responseStyle),
    "Reply in the same language as the user unless they ask for another language.",
    "Keep the answer short to medium length and suitable for a mobile coaching experience.",
  ].join("\n\n");
}

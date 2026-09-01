# Exercise Experience V2: Risks, Mitigations, and Roadmap

## Project Scope

This document outlines the risks, mitigations, and roadmap for the two connected product decisions in the Viora Exercise Experience V2 update:
1. Asset Pipeline V2 (Hero Cover + Motion Video)
2. “התובנות שלי” (My Insights)

*Note: This sprint (VIORA-EXERCISE-EXPERIENCE-V2-DOCS-001) covers documentation only. Implementation occurs in future sprints.*

## Risks and Mitigations

### 1. Media Migration & Display Breakage
- **Risk:** New assets break the existing UI or users are left without visual instruction if generation fails.
- **Mitigation:**
  - Generate V2 assets alongside old assets.
  - Require strict QA before flipping the switch per exercise.
  - Implement a mandatory fallback to the old assets or the new Hero Cover. Do not remove old assets.

### 2. Biomechanical Inaccuracies in AI Video
- **Risk:** Gemini-generated motion videos might hallucinate impossible joint movements or incorrect resistance paths, leading to injury.
- **Mitigation:**
  - Enforce the "Strict Motion Lock" prompt template.
  - Mandate professional-source research before generation.
  - Require manual human QA against the Biomechanics Checklist before publication. AI generation is not automatic publication.

### 3. Privacy Leaks in "My Insights"
- **Risk:** Sensitive user notes (e.g., pain, medical history) are exposed to other users or sent to AI providers without consent.
- **Mitigation:**
  - Enforce strict Row Level Security (RLS) scoping to `user_id`.
  - Gate AI provider transmission behind explicit user consent (Advisor context consent).
  - Provide clear UI controls for deleting insights.

### 4. Client Performance and Data Usage
- **Risk:** Auto-playing looping videos consume excessive data and drain battery, especially on older devices or cellular networks.
- **Mitigation:**
  - Enforce 6-10 second loop limits.
  - Implement data-saving modes and respect OS-level "Reduced Motion" settings (falling back to the static Hero Cover).
  - Cache viewed videos.

## Implementation Roadmap

Implementation of the V2 experience should proceed in the following order:

1. **Phase 1: Database & Backend Foundation**
   - Implement Supabase migrations for the My Insights data model (`exercise_equipment_profiles`, `exercise_insights`).
   - Implement RLS policies.
   - Extend existing media-registry API/services to support the V2 asset types (Hero Cover, Motion Video) alongside legacy assets.

2. **Phase 2: Asset Pipeline Generation & QA**
   - Develop internal scripts/workflows utilizing the Gemini Motion Master Prompt to generate V2 assets.
   - Build out the QA dashboard/process (incorporating the Biomechanics checklist and QA persistence mechanisms).

3. **Phase 3: UI Implementation - My Insights**
   - Build the collapsed/expanded UI for "התובנות שלי" on the exercise-library and active workout pages.
   - Implement the staged flow (profile -> category -> value/note) for adding insights.
   - Connect to backend services, ensuring local cache behavior for speed.

4. **Phase 4: UI Implementation - V2 Media Playback**
   - Update the exercise detail and workout session views to support the new Hero Cover + Motion Video playback.
   - Implement the fallback logic, caching, and OS setting awareness (reduced motion/data saver).

5. **Phase 5: Rollout & Migration**
   - Begin publishing QA-approved V2 assets.
   - Incrementally switch exercises over to the V2 pipeline.
   - Monitor performance and feedback.

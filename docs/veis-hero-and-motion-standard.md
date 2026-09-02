# VEIS Hero and Motion Standard

## Hero Cover Standard

Each exercise requires a primary static asset acting as the Hero Cover.

- **Aspect Ratio:** Landscape 16:9.
- **Visual Purity:** No visible text, labels, icons, branding strips, or UI elements.
- **Art Direction:** Premium semi-realistic 3D illustration.
- **Subject Presentation:** One recognizable exercise pose.
- **Anatomy Style:** Grey anatomical body.
- **Highlighting:**
  - Primary muscle highlighted orange.
  - Secondary muscles highlighted lighter orange.
- **Demonstrator Identity:** V1 uses exactly one official generic exercise demonstrator (VIORA-EXERCISE-GENERIC-DEMONSTRATOR-DECISION-001). This supersedes the earlier two-demonstrator (male/female) decision. Multiple official demonstrators and any user-selectable variant are postponed.
- **Consistency:** The Hero Cover and Motion Video for a given exercise must preserve the same generic character identity, equipment, clothing, camera, and illustration style.

## Motion Video Standard

The Motion Video is generated from the approved Hero using Gemini.

- **Duration:** 6–10 seconds.
- **Action:** One controlled repetition.
- **Playback Style:** Seamless loop.
- **Audio & Visual Purity:** No narration, audible instruction, visible text, or UI elements.
- **Instruction Policy:** Motion Video is the primary visible exercise instruction. Do not display a permanent written exercise guide below the video.

## Playback Behaviour

- Muted autoplay loop by default.
- User can tap to pause or resume.
- In Reduced Motion and data-saving modes, the system shows the Hero Cover with a Play action.
- Hero Cover must be available offline after it has been successfully fetched and cached, unless a future decision explicitly requires pre-caching the entire exercise library.
- Viewed videos may be cached after first playback.
- An unavailable or uncached video falls back safely to the Hero Cover.

## Accessibility

The video cannot be the only accessible representation of the exercise. To maintain inclusivity and support assistive technologies, the following requirements apply:
- **Structured Metadata:** Preserve structured exercise instructions and accessible text metadata for assistive technologies, even when no permanent written guide is visually displayed under the video.
- **Alt Text:** The static Hero Cover must include meaningful alt text.
- **Keyboard Navigation:** The video's pause/resume functionality must be keyboard-accessible.
- **Playback State:** The playback state (playing/paused) must be visible and accessible to screen readers.
- **Reduced Motion:** The implementation must support system-level "Reduced Motion" preferences by disabling autoplay.
- **Color Independence:** Muscle identification cannot depend on color alone; supplementary text or patterns must support the visual highlighting (orange/light orange).

## Open Decisions

- Video encoding and maximum file size.
- Exact UI styling.

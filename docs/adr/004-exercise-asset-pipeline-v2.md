# ADR 004: Exercise Asset Pipeline V2

## Decision

Viora replaces the default multi-image exercise-media pipeline with a unified two-asset standard:
1. Hero Cover
2. Motion Video

Infographic, Guide, and step images are removed from the default future production pipeline. This simplifies the exercise instruction down to a visually consistent, muted auto-playing Motion Video, falling back to a recognizable high-quality Hero Cover.

## Compatibility and preservation

Existing media assets and existing structured metadata required for accessibility, search, and filtering must be preserved. Existing assets must not be deleted. A fallback mechanism is mandated: an unavailable or uncached video safely falls back to the offline-available Hero Cover.

## Demonstrator identity (resolved)

VIORA-EXERCISE-GENERIC-DEMONSTRATOR-DECISION-001: V1 uses exactly one official generic exercise demonstrator, superseding the earlier daniel/maya two-demonstrator decision. The Hero Cover and Motion Video for a given exercise must preserve the same generic character identity, equipment, clothing, camera, and illustration style. Multiple official demonstrators and any user-selectable variant are postponed.

## Open Decisions

The following implementation and technical decisions remain unresolved and require future architectural definition:

- Video encoding and maximum file size.
- Cache limits and eviction policy.
- QA/Published persistence.
- Archived-media location.
- Final table names and migration SQL.

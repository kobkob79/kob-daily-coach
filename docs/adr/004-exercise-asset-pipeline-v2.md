# ADR 004: Exercise Asset Pipeline V2

## Decision

Viora replaces the default multi-image exercise-media pipeline with a unified two-asset standard:
1. Hero Cover
2. Motion Video

Infographic, Guide, and step images are removed from the default future production pipeline. This simplifies the exercise instruction down to a visually consistent, muted auto-playing Motion Video, falling back to a recognizable high-quality Hero Cover.

## Compatibility and preservation

Existing media assets and existing structured metadata required for accessibility, search, and filtering must be preserved. Existing assets must not be deleted. A fallback mechanism is mandated: an unavailable or uncached video safely falls back to the offline-available Hero Cover.

## Open Decisions

The following implementation and technical decisions remain unresolved and require future architectural definition:

- Exact male/female exercise-assignment rule.
- Video encoding and maximum file size.
- Cache limits and eviction policy.
- QA/Published persistence.
- Archived-media location.
- Final table names and migration SQL.

# Old-to-New Media Migration Plan

## Objective

Safely transition the exercise library from the legacy multi-image format (infographics, guides, step images) to the new Asset Pipeline V2 (Hero Cover + Motion Video) without breaking existing user experiences or data.

## Migration Rules

1. **Preserve Existing Media:** Existing assets must not be deleted. They will remain available while the transition occurs.
2. **Parallel Generation:** Generate V2 assets (Hero Cover and Motion Video) alongside the old assets.
3. **Staged Switchover:** Switch an exercise to use V2 only *after* both the Hero Cover and the Motion Video have passed the complete Biomechanics and QA checklist.
4. **Valid Fallback Required:** Never leave an exercise without a valid fallback asset. If V2 assets are not yet approved, the system should continue using or falling back to the legacy assets.
5. **Recoverable Archiving:** Archive superseded assets recoverably.

## Open Decisions

The following details are not finalized and are outside the scope of this initial plan:

- QA/Published persistence mechanisms (e.g., tracking migration state per exercise).
- Archived-media location (where legacy assets are permanently stored post-migration).
- Final table names and migration SQL.
- (No `qa.json` or live migration code is introduced in this phase).

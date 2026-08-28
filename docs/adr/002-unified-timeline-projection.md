# ADR 002: Unified Timeline projection

## Decision

The Unified Timeline is a deterministic read-only projection over owned domain records. Every item carries a stable projection key, source domain/table/record, Bio Day identity when known, planned/completed classification, timestamps, provenance, sensitivity and a legacy marker.

Adapters cover nutrition entries, daily water/supplement/sleep/weight events, workout instances, workout sessions, legacy workouts and health logs. They do not rewrite source records. Sorting is deterministic by effective timestamp and then projection key.

## Source precedence and conflicts

Modern workout sessions/instances take precedence over a legacy workout only when an explicit link exists or one unambiguous completed-session signature matches the legacy date and normalized name. Ambiguous rows remain visible and are marked conflicting rather than silently dropped. Canonical Bio Day assignments win over legacy date fields.

General timeline health summaries expose only a neutral check-in label and severity band; notes and medical-document content are excluded.

## Rejected alternatives

- A new universal events table containing copies: duplicates facts and complicates deletion/correction.
- UI-specific merging in each screen: repeats precedence and privacy rules.
- Fuzzy workout matching: may hide legitimate workouts.

## Compatibility

Existing Dashboard, Journal and Progress remain unchanged. The projection is an adoptable read model. Future Health Connect adapters must include external source identity and deduplication keys.

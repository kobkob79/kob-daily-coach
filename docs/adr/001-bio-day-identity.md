# ADR 001: Canonical Bio Day identity

## Decision

Viora records a Bio Day as a user-owned interval with a stable UUID, IANA timezone, absolute start/end instants, local display date, boundary source and audit metadata. An explicit confirmed wake instant wins; otherwise a known shift or schedule start is used; otherwise the legacy 05:00 local boundary is retained. Inference is labelled and is never presented as measured fact.

An open Bio Day has no end. A nap does not close it. A future main-sleep workflow may close it. Manual corrections retain their reason and previous boundary values. Events are associated through an assignment overlay; factual meal, workout and health rows are not copied or destructively backfilled.

## Compatibility and precedence

Canonical assignments win. An unassigned legacy row uses its existing `biological_day`; a timestamp-only row uses the recorded Bio Day timezone and interval; the 05:00 rule is the final compatibility fallback. Local dates are derived with `Intl`/IANA timezone rules, never `toISOString().slice(0, 10)`.

## Ownership and security

RLS binds rows to `auth.uid()`. Ownership is immutable, anonymous access is revoked and updates require both `USING` and `WITH CHECK`. An authenticated user can never select another user's day. Admin status does not expand personal access.

## Rejected alternatives

- A global UTC day: incorrect for shifts and cross-midnight waking periods.
- A fixed 05:00 day forever: useful fallback, not a measured boundary.
- Adding `bio_day_id` to every existing table now: high-risk migration and duplicated rollout.
- Copying all facts to a new event table: creates a second factual source.

## Future implications

Health Connect imports must retain source timestamps/timezones and resolve through the same interval service. Late events may be assigned after arrival without changing their factual timestamp.

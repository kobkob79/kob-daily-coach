# ADR 003: Advisor Context Snapshot and privacy

## Decision

Advisor context is a deterministic snapshot built from the same sourced records as the Unified Timeline. Facts carry state (`known`, `missing`, `stale`, `conflicting`), source names, observation time and confidence. A safe debug projection exposes only structure, state, freshness and source names.

Selectors minimize disclosure:

- Adam: sleep, recovery, shift and lifestyle.
- Daniel: planned/current/recent training, load and relevant limitations.
- Maya: movement, pain, mobility and recovery.
- Shiran: meals, macros, hydration and nutrition goals.

Full medical documents, notes, Storage paths, signed URLs, service-role data and Admin metadata are excluded. User identity is obtained from authenticated server context; Admin status does not permit selecting another user.

## Rejected alternatives

- Passing the entire database/profile to prompts: excessive disclosure and weak provenance.
- Persisting a second AI-owned truth: becomes stale and obscures sources.
- Letting the client choose a user ID: insecure direct-object access.

## Compatibility and future boundary

This sprint does not connect the snapshot to AI or change prompts, quota or conversations. A future Advisor Context Bridge may consume a selector result only after entitlement, audit and token-budget policies are applied.

# Offline and Cache Behaviour

## Asset Pipeline V2

- **Hero Cover:** The static Hero Cover is the fundamental fallback asset. It must be available offline after it has been successfully fetched and cached, unless a future decision explicitly requires pre-caching the entire exercise library.
- **Motion Video:**
  - Viewed videos may be cached after first playback to save data and ensure smooth future loops.
  - Reduced Motion and data-saving modes prevent automatic downloading and playback of the video, showing the Hero Cover with a Play action instead.
  - **Fallback mechanism:** If a video is unavailable (e.g., no network connection and not in cache), the client gracefully falls back to displaying the cached Hero Cover.

## “התובנות שלי” (My Insights)

- **Source of Truth:** Supabase remains the definitive source of truth.
- **Local Cache:** A local cache may be implemented for speed (e.g., instantaneous UI updates during an active workout session) but not as the final authority.
- **Offline Writes:** Offline behavior for writes is tied to broader platform durability goals (like the offline write queue mentioned in the product roadmap). While offline, users should ideally still be able to view their cached insights and potentially queue updates, but the exact synchronization strategy is an implementation detail for the offline sprint.

## Open Decisions

- Pre-cache strategy (e.g., whether to pre-fetch popular Hero Covers).
- Cache limits and eviction policy (e.g., LRU cache size for videos).
- Details of the offline write queue behavior for My Insights updates.

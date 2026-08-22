-- Exercise assets are managed only by the protected server-side Admin flow.
-- Reads remain available through the existing authenticated SELECT policy.

drop policy if exists "exercise-assets authenticated insert"
on storage.objects;

drop policy if exists "exercise-assets authenticated update"
on storage.objects;

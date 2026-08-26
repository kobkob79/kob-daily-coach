import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({
  appType: "custom",
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true },
});

try {
  const media = await server.ssrLoadModule("/src/lib/about-media.ts");
  assert.equal(
    media.validateAboutMediaFile(new File(["ok"], "photo.jpg", { type: "image/jpeg" })),
    null,
  );
  assert.equal(
    media.validateAboutMediaFile(new File(["ok"], "photo.png", { type: "image/png" })),
    null,
  );
  assert.equal(
    media.validateAboutMediaFile(new File(["ok"], "photo.webp", { type: "image/webp" })),
    null,
  );
  assert.match(
    media.validateAboutMediaFile(new File(["bad"], "photo.svg", { type: "image/svg+xml" })),
    /JPEG/,
  );
  assert.match(
    media.validateAboutMediaFile(
      new File([new Uint8Array(media.ABOUT_MEDIA_MAX_BYTES + 1)], "large.jpg", {
        type: "image/jpeg",
      }),
    ),
    /6MB/,
  );
  assert.equal(media.getAboutMediaLimit("team"), 1);
  assert.equal(media.getAboutMediaLimit("shiran"), 5);

  const migration = await readFile(
    `${root}/supabase/migrations/20260826180750_create_about_team_media.sql`,
    "utf8",
  );
  assert.match(migration, /file_size_limit[\s\S]*6291456/);
  assert.match(migration, /image\/jpeg/);
  assert.match(migration, /image\/png/);
  assert.match(migration, /image\/webp/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to anon, authenticated[\s\S]*using \(is_active\)/i);
  assert.doesNotMatch(migration, /for (insert|update|delete)\s+to authenticated/i);
  assert.match(migration, /unique index about_media_one_primary_per_subject/i);
  assert.match(
    migration,
    /grant execute on function public\.set_about_media_primary\(uuid\) to service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.reorder_about_media\(text, uuid\[\]\) to service_role/i,
  );

  console.log(
    JSON.stringify({
      jpeg_png_webp_validation: "PASS",
      unsupported_mime_rejected: "PASS",
      six_mb_limit: "PASS",
      team_single_and_person_five_limits: "PASS",
      public_active_read_only: "PASS",
      authenticated_direct_writes_absent: "PASS",
      one_primary_constraint: "PASS",
      primary_rpc_service_role_only: "PASS",
      reorder_rpc_service_role_only: "PASS",
    }),
  );
} finally {
  await server.close();
}

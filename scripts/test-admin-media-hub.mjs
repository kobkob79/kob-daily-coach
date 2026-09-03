import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(`${root}/${path}`, "utf8");

const [center, manager, hub, aboutPage, adminLayout, registryRoute, aboutViora] = await Promise.all([
  read("src/components/admin/ManagementCenter.tsx"),
  read("src/components/admin/AboutMediaManager.tsx"),
  read("src/routes/_authenticated/admin.media.index.tsx"),
  read("src/routes/_authenticated/admin.media.about.tsx"),
  read("src/routes/_authenticated/admin.tsx"),
  read("src/routes/_authenticated/admin.exercise-registry.tsx"),
  read("src/components/about/AboutVioraPage.tsx"),
]);

/* Main admin page: no inline About media, single entry card. */
assert.doesNotMatch(center, /AboutMediaManager/);
assert.match(center, /ניהול מדיה/);
assert.match(center, /העלאה, ארגון וניהול המדיה של Viora/);
assert.match(center, /to="\/admin\/media"/);

/* Media hub route + categories. */
assert.match(hub, /createFileRoute\("\/_authenticated\/admin\/media\/"\)/);
assert.match(aboutPage, /createFileRoute\("\/_authenticated\/admin\/media\/about"\)/);
assert.match(aboutPage, /to="\/admin\/media"/);
assert.match(aboutPage, /<AboutMediaManager \/>/);

/* Admin authorization guard preserved. */
assert.match(adminLayout, /requireAdminAccessServer/);
assert.match(adminLayout, /redirect\(\{ to: "\/dashboard" \}\)/);

/* Existing media collapsed by default, accessible toggle. */
assert.match(manager, /GALLERY_DEFAULT_EXPANDED/);
assert.match(manager, /aria-expanded=\{galleryExpanded\}/);
assert.match(manager, /type="button"/);
assert.match(manager, /ניהול מדיה קיימת/);
assert.match(manager, /setGalleryExpanded\(toggleGalleryExpanded\)/);

/* Business logic untouched: mutations still wired to the existing functions. */
for (const fn of [
  "deleteAboutMedia",
  "replaceAboutMedia",
  "setPrimaryAboutMedia",
  "reorderAboutMedia",
  "updateAboutMedia",
  "uploadAboutMedia",
])
  assert.match(manager, new RegExp(`${fn}\\(`));
assert.match(manager, /for \(const job of jobs\) await uploadOne\(job\)/);

/* Uploader reset never deletes media. */
const resetBlock = manager.slice(manager.indexOf("allUploadJobsSucceeded(jobsRef.current)"));
assert.doesNotMatch(resetBlock.slice(0, 400), /deleteAboutMedia/);

/* Exercise media dashboard + public About media untouched. */
assert.match(registryRoute, /ExerciseRegistryDashboard/);
assert.match(aboutViora, /teamMedia = primaryFirst/);

/* Behavioral coverage of the pure state helpers. */
const server = await createServer({
  appType: "custom",
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true },
});
try {
  const hubLib = await server.ssrLoadModule("/src/lib/admin-media-hub.ts");
  assert.equal(hubLib.GALLERY_DEFAULT_EXPANDED, false);
  assert.equal(hubLib.toggleGalleryExpanded(false), true);
  assert.equal(hubLib.toggleGalleryExpanded(hubLib.toggleGalleryExpanded(false)), false);

  const titles = hubLib.ADMIN_MEDIA_CATEGORIES.map((c) => c.title);
  assert.deepEqual(titles, ["מי אנחנו", "מאגר תרגילים"]);
  assert.deepEqual(
    hubLib.ADMIN_MEDIA_CATEGORIES.map((c) => c.to),
    ["/admin/media/about", "/admin/exercise-registry"],
  );

  const done = [{ stage: "הושלם" }, { stage: "הושלם" }];
  const mixed = [{ stage: "הושלם" }, { stage: "נכשל" }];
  assert.equal(hubLib.allUploadJobsSucceeded(done), true);
  assert.equal(hubLib.allUploadJobsSucceeded(mixed), false);
  assert.equal(hubLib.allUploadJobsSucceeded([]), false);
  assert.deepEqual(hubLib.pruneCompletedUploadJobs(done), []);
  assert.deepEqual(hubLib.pruneCompletedUploadJobs(mixed), [{ stage: "נכשל" }]);
} finally {
  await server.close();
}

console.log(
  JSON.stringify(
    {
      admin_no_inline_about_media: "PASS",
      admin_media_entry_card: "PASS",
      media_hub_categories: "PASS",
      about_media_route: "PASS",
      gallery_collapsed_by_default: "PASS",
      gallery_toggle_accessible: "PASS",
      upload_reset_ui_only: "PASS",
      media_mutations_intact: "PASS",
      exercise_dashboard_unchanged: "PASS",
      public_about_media_unchanged: "PASS",
      admin_guard_intact: "PASS",
    },
    null,
    2,
  ),
);

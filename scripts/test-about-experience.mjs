import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(`${root}/${path}`, "utf8");
const [people, story, gallery, dashboard, manager] = await Promise.all([
  read("src/lib/about-people.ts"),
  read("src/components/about/PersonStoryPage.tsx"),
  read("src/components/about/StoryGallery.tsx"),
  read("src/routes/_authenticated/dashboard.tsx"),
  read("src/components/admin/AboutMediaManager.tsx"),
]);

for (const title of [
  "מי אני",
  "המשפחה שמאחורי החזון",
  "החיים שלא נכנסים לאפליקציה אחת",
  "הרגע שבו נולד הרעיון של Viora",
  "איך Viora משתלבת בחיים שלי",
  "למה בניתי אותה גם עבור אחרים",
  "לאן Viora הולכת",
])
  assert.match(people, new RegExp(title));
assert.match(story, /person\.slug !== "kobi"/);
assert.match(story, /to="\/coach\/\$advisorId"/);
assert.match(story, /index === 1.*StoryGallery/s);
assert.match(gallery, /snap-mandatory/);
assert.match(gallery, /role="dialog"/);
assert.match(gallery, /popstate/);
assert.match(gallery, /onTouchEnd/);
assert.match(dashboard, /aspect-video/);
assert.match(dashboard, /object-contain/);
for (const stage of ["מכין תמונה", "מכווץ", "מעלה", "הושלם", "נכשל"])
  assert.match(manager, new RegExp(stage));
assert.match(manager, /for \(const job of jobs\) await uploadOne\(job\)/);

console.log(
  JSON.stringify({
    kobi_seven_sections: "PASS",
    coach_cta: "PASS",
    inline_story_gallery: "PASS",
    mobile_snap_and_viewer: "PASS",
    home_contain_image: "PASS",
    five_image_sequential_state_model: "PASS",
  }),
);

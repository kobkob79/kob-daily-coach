-- Core 150 shared exercise catalogue.
--
-- Safety properties:
--   * Existing exercise IDs are retained for exact-name matches and renames.
--   * No exercise row is deleted, including rows with history or references.
--   * Missing shared exercises are inserted idempotently.
--   * Reference merges are disabled unless explicit, verified UUID pairs are
--     added to tmp_core_150_verified_merges below.
--   * A merge aborts before changing references if it would collide with an
--     existing workout set or duplicate an exercise inside a template.

-- ---------------------------------------------------------------------------
-- 1. RENAME: normalize reviewed legacy labels while preserving their IDs.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE tmp_core_150_renames (
  old_name text PRIMARY KEY,
  canonical_name text NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO tmp_core_150_renames (old_name, canonical_name) VALUES
  ('Incline Dumbbell Press', 'לחיצת חזה בשיפוע חיובי בדאמבלים'),
  ('Dips', 'מקבילים בדגש על החזה'),
  ('Triceps Rope Pushdown', 'פשיטת מרפקים בחבל בכבל'),
  ('Face Pull', 'משיכת חבל לפנים'),
  ('Barbell Curl', 'כפיפת מרפקים במוט ישר'),
  ('Bulgarian Split Squat', 'בולגרי ספליט סקוואט'),
  ('Standing Calf Raise', 'הרמת עקבים בעמידה במכונה'),
  ('Dead Bug', 'דד באג'),
  ('Bird Dog', 'בירד דוג'),
  ('Pallof Press', 'פאלוף פרס'),
  ('Cat-Cow', 'תנועת חתול־פרה'),
  ('Band Pull-Apart', 'משיכת גומייה לצדדים'),
  ('לחיצת חזה בשיפוע', 'לחיצת חזה בשיפוע חיובי במוט'),
  ('לחיצת חזה עם משקולות', 'לחיצת חזה בדאמבלים'),
  ('חתירה בישיבה', 'חתירה בישיבה בכבל'),
  ('חתירה חד־ידית', 'חתירה בדאמבל ביד אחת'),
  ('לחיצת כתפיים', 'לחיצת כתפיים בדאמבלים'),
  ('הרחקת כתפיים', 'הרחקת כתפיים בדאמבלים'),
  ('הרמות קדמיות', 'הרמת ידיים קדימה בדאמבלים'),
  ('כפיפת פטיש', 'כפיפת מרפקים בפטיש'),
  ('פשיטת מרפקים', 'פשיטת מרפקים בכבל ביד אחת'),
  ('סקוואט', 'סקוואט עם מוט'),
  ('לאנג׳', 'לאנג'' קדמי'),
  ('פשיטת ברכיים', 'פשיטת ברכיים במכונה'),
  ('דדליפט', 'דדליפט קלאסי'),
  ('דדליפט רומני', 'דדליפט רומני במוט'),
  ('היפ ת׳ראסט', 'היפ תראסט במוט');

-- Known production collisions intentionally excluded from automatic rename:
--   * חתירה בישיבה keeps its active/history ID and is renamed to the approved
--     catalogue label; Seated Cable Row remains legacy.
--   * סקוואט is the source renamed to the catalogue label; סקוואט אחורי remains legacy.
--   * Standing Calf Raise is the source renamed to the catalogue label because
--     it is referenced by a template; הרמת עקבים remains legacy.
--   * Triceps Rope Pushdown keeps its active/history ID and is renamed to the
--     approved catalogue label; פשיטת מרפקים בפולי remains legacy.

-- Rename only an unambiguous shared row and only when the canonical target is
-- not already present. Ambiguous cases are intentionally left for a reviewed
-- UUID-based merge, so no existing ID is guessed or replaced.
UPDATE public.exercises AS e
SET name = r.canonical_name,
    updated_at = now()
FROM tmp_core_150_renames AS r
WHERE e.owner_id IS NULL
  AND e.name = r.old_name
  AND (SELECT count(*) FROM public.exercises x
       WHERE x.owner_id IS NULL AND x.name = r.old_name) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.exercises target
    WHERE target.owner_id IS NULL
      AND target.name = r.canonical_name
  );

-- ---------------------------------------------------------------------------
-- 2. INSERT: add missing entries from the canonical Core 150 catalogue.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE tmp_core_150_catalog (
  name text PRIMARY KEY,
  category public.exercise_category NOT NULL,
  muscle_group text NOT NULL,
  equipment text NOT NULL,
  description text NOT NULL,
  default_sets integer NOT NULL,
  default_reps integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_core_150_catalog
  (name, category, muscle_group, equipment, description, default_sets, default_reps)
VALUES
  -- Chest (15)
  ('לחיצת חזה במוט', 'push', 'חזה', 'various', 'לחיצת חזה במוט', 3, 10),
  ('לחיצת חזה בדאמבלים', 'push', 'חזה', 'various', 'לחיצת חזה בדאמבלים', 3, 10),
  ('לחיצת חזה במכונה', 'push', 'חזה', 'various', 'לחיצת חזה במכונה', 3, 10),
  ('לחיצת חזה בשיפוע חיובי במוט', 'push', 'חזה', 'various', 'לחיצת חזה בשיפוע חיובי במוט', 3, 10),
  ('לחיצת חזה בשיפוע חיובי בדאמבלים', 'push', 'חזה', 'various', 'לחיצת חזה בשיפוע חיובי בדאמבלים', 3, 10),
  ('לחיצת חזה בשיפוע חיובי במכונה', 'push', 'חזה', 'various', 'לחיצת חזה בשיפוע חיובי במכונה', 3, 10),
  ('לחיצת חזה בשיפוע שלילי במוט', 'push', 'חזה', 'various', 'לחיצת חזה בשיפוע שלילי במוט', 3, 10),
  ('לחיצת חזה בשיפוע שלילי בדאמבלים', 'push', 'חזה', 'various', 'לחיצת חזה בשיפוע שלילי בדאמבלים', 3, 10),
  ('פרפר במכונה', 'push', 'חזה', 'various', 'פרפר במכונה', 3, 10),
  ('פרפר בכבלים בעמידה', 'push', 'חזה', 'various', 'פרפר בכבלים בעמידה', 3, 10),
  ('פרפר בכבלים מלמעלה למטה', 'push', 'חזה', 'various', 'פרפר בכבלים מלמעלה למטה', 3, 10),
  ('פרפר בכבלים מלמטה למעלה', 'push', 'חזה', 'various', 'פרפר בכבלים מלמטה למעלה', 3, 10),
  ('פרפר בדאמבלים בשכיבה', 'push', 'חזה', 'various', 'פרפר בדאמבלים בשכיבה', 3, 10),
  ('שכיבות סמיכה', 'push', 'חזה', 'various', 'שכיבות סמיכה', 3, 10),
  ('מקבילים בדגש על החזה', 'push', 'חזה', 'various', 'מקבילים בדגש על החזה', 3, 10),

  -- Back (20)
  ('מתח באחיזה רחבה', 'pull', 'גב', 'various', 'מתח באחיזה רחבה', 3, 10),
  ('מתח באחיזה צרה', 'pull', 'גב', 'various', 'מתח באחיזה צרה', 3, 10),
  ('מתח באחיזה הפוכה', 'pull', 'גב', 'various', 'מתח באחיזה הפוכה', 3, 10),
  ('משיכת פולי עליון באחיזה רחבה', 'pull', 'גב', 'various', 'משיכת פולי עליון באחיזה רחבה', 3, 10),
  ('משיכת פולי עליון באחיזה צרה', 'pull', 'גב', 'various', 'משיכת פולי עליון באחיזה צרה', 3, 10),
  ('משיכת פולי עליון באחיזה הפוכה', 'pull', 'גב', 'various', 'משיכת פולי עליון באחיזה הפוכה', 3, 10),
  ('חתירה בישיבה בכבל', 'pull', 'גב', 'various', 'חתירה בישיבה בכבל', 3, 10),
  ('חתירה במכונה', 'pull', 'גב', 'various', 'חתירה במכונה', 3, 10),
  ('חתירה במכונה עם תמיכת חזה', 'pull', 'גב', 'various', 'חתירה במכונה עם תמיכת חזה', 3, 10),
  ('חתירה בדאמבל ביד אחת', 'pull', 'גב', 'various', 'חתירה בדאמבל ביד אחת', 3, 10),
  ('חתירה במוט', 'pull', 'גב', 'various', 'חתירה במוט', 3, 10),
  ('חתירה בטי־בר', 'pull', 'גב', 'various', 'חתירה בטי־בר', 3, 10),
  ('חתירה בדאמבלים עם תמיכת חזה', 'pull', 'גב', 'various', 'חתירה בדאמבלים עם תמיכת חזה', 3, 10),
  ('משיכת זרועות ישרות בכבל', 'pull', 'גב', 'various', 'משיכת זרועות ישרות בכבל', 3, 10),
  ('פולאובר בכבל', 'pull', 'גב', 'various', 'פולאובר בכבל', 3, 10),
  ('פולאובר בדאמבל', 'pull', 'גב', 'various', 'פולאובר בדאמבל', 3, 10),
  ('חתירה בפולי נמוך באחיזה רחבה', 'pull', 'גב', 'various', 'חתירה בפולי נמוך באחיזה רחבה', 3, 10),
  ('חתירה בפולי נמוך באחיזה צרה', 'pull', 'גב', 'various', 'חתירה בפולי נמוך באחיזה צרה', 3, 10),
  ('חתירה הפוכה במשקל גוף', 'pull', 'גב', 'various', 'חתירה הפוכה במשקל גוף', 3, 10),
  ('משיכת גומייה לכיוון החזה', 'pull', 'גב', 'various', 'משיכת גומייה לכיוון החזה', 3, 10),

  -- Shoulders (15)
  ('לחיצת כתפיים בדאמבלים', 'push', 'כתפיים', 'various', 'לחיצת כתפיים בדאמבלים', 3, 10),
  ('לחיצת כתפיים במכונה', 'push', 'כתפיים', 'various', 'לחיצת כתפיים במכונה', 3, 10),
  ('לחיצת כתפיים במוט', 'push', 'כתפיים', 'various', 'לחיצת כתפיים במוט', 3, 10),
  ('לחיצת ארנולד', 'push', 'כתפיים', 'various', 'לחיצת ארנולד', 3, 10),
  ('הרחקת כתפיים בדאמבלים', 'push', 'כתפיים', 'various', 'הרחקת כתפיים בדאמבלים', 3, 10),
  ('הרחקת כתפיים בכבל', 'push', 'כתפיים', 'various', 'הרחקת כתפיים בכבל', 3, 10),
  ('הרחקת כתפיים במכונה', 'push', 'כתפיים', 'various', 'הרחקת כתפיים במכונה', 3, 10),
  ('הרחקת כתף בכבל ביד אחת', 'push', 'כתפיים', 'various', 'הרחקת כתף בכבל ביד אחת', 3, 10),
  ('הרמת ידיים קדימה בדאמבלים', 'push', 'כתפיים', 'various', 'הרמת ידיים קדימה בדאמבלים', 3, 10),
  ('הרמת ידיים קדימה בכבל', 'push', 'כתפיים', 'various', 'הרמת ידיים קדימה בכבל', 3, 10),
  ('פרפר הפוך במכונה', 'push', 'כתפיים', 'various', 'פרפר הפוך במכונה', 3, 10),
  ('פרפר הפוך בדאמבלים', 'push', 'כתפיים', 'various', 'פרפר הפוך בדאמבלים', 3, 10),
  ('משיכת חבל לפנים', 'push', 'כתפיים', 'various', 'משיכת חבל לפנים', 3, 10),
  ('משיכה אנכית בכבל', 'push', 'כתפיים', 'various', 'משיכה אנכית בכבל', 3, 10),
  ('סיבוב כתף חיצוני בכבל', 'push', 'כתפיים', 'various', 'סיבוב כתף חיצוני בכבל', 3, 10),

  -- Biceps (12)
  ('כפיפת מרפקים במוט ישר', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים במוט ישר', 3, 10),
  ('כפיפת מרפקים במוט EZ', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים במוט EZ', 3, 10),
  ('כפיפת מרפקים בדאמבלים', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים בדאמבלים', 3, 10),
  ('כפיפת מרפקים לסירוגין בדאמבלים', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים לסירוגין בדאמבלים', 3, 10),
  ('כפיפת מרפקים בפטיש', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים בפטיש', 3, 10),
  ('כפיפת מרפקים בכבל', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים בכבל', 3, 10),
  ('כפיפת מרפקים בכבל ביד אחת', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים בכבל ביד אחת', 3, 10),
  ('כפיפת מרפקים על ספסל שיפוע', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים על ספסל שיפוע', 3, 10),
  ('כפיפת מרפקים על ספסל סקוט', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים על ספסל סקוט', 3, 10),
  ('כפיפת מרפקים במכונת סקוט', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים במכונת סקוט', 3, 10),
  ('כפיפת מרפקים בריכוז', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים בריכוז', 3, 10),
  ('כפיפת מרפקים הפוכה במוט', 'pull', 'יד קדמית', 'various', 'כפיפת מרפקים הפוכה במוט', 3, 10),

  -- Triceps (12)
  ('פשיטת מרפקים בחבל בכבל', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים בחבל בכבל', 3, 10),
  ('פשיטת מרפקים במוט ישר בכבל', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים במוט ישר בכבל', 3, 10),
  ('פשיטת מרפקים בכבל ביד אחת', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים בכבל ביד אחת', 3, 10),
  ('פשיטת מרפקים מעל הראש בחבל', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים מעל הראש בחבל', 3, 10),
  ('פשיטת מרפקים מעל הראש בדאמבל', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים מעל הראש בדאמבל', 3, 10),
  ('לחיצת חזה באחיזה צרה', 'push', 'יד אחורית', 'various', 'לחיצת חזה באחיזה צרה', 3, 10),
  ('פשיטת מרפקים בשכיבה במוט EZ', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים בשכיבה במוט EZ', 3, 10),
  ('פשיטת מרפקים בשכיבה בדאמבלים', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים בשכיבה בדאמבלים', 3, 10),
  ('קיקבק בדאמבל', 'push', 'יד אחורית', 'various', 'קיקבק בדאמבל', 3, 10),
  ('קיקבק בכבל', 'push', 'יד אחורית', 'various', 'קיקבק בכבל', 3, 10),
  ('מקבילים בדגש על יד אחורית', 'push', 'יד אחורית', 'various', 'מקבילים בדגש על יד אחורית', 3, 10),
  ('פשיטת מרפקים במכונה', 'push', 'יד אחורית', 'various', 'פשיטת מרפקים במכונה', 3, 10),

  -- Quadriceps (12)
  ('סקוואט עם מוט', 'legs', 'רגליים', 'various', 'סקוואט עם מוט', 3, 10),
  ('סקוואט קדמי', 'legs', 'רגליים', 'various', 'סקוואט קדמי', 3, 10),
  ('גובלט סקוואט', 'legs', 'רגליים', 'various', 'גובלט סקוואט', 3, 10),
  ('האק סקוואט', 'legs', 'רגליים', 'various', 'האק סקוואט', 3, 10),
  ('לחיצת רגליים', 'legs', 'רגליים', 'various', 'לחיצת רגליים', 3, 10),
  ('לחיצת רגליים חד־צדדית', 'legs', 'רגליים', 'various', 'לחיצת רגליים חד־צדדית', 3, 10),
  ('פשיטת ברכיים במכונה', 'legs', 'רגליים', 'various', 'פשיטת ברכיים במכונה', 3, 10),
  ('פשיטת ברך חד־צדדית במכונה', 'legs', 'רגליים', 'various', 'פשיטת ברך חד־צדדית במכונה', 3, 10),
  ('לאנג'' קדמי', 'legs', 'רגליים', 'various', 'לאנג'' קדמי', 3, 10),
  ('לאנג'' לאחור', 'legs', 'רגליים', 'various', 'לאנג'' לאחור', 3, 10),
  ('בולגרי ספליט סקוואט', 'legs', 'רגליים', 'various', 'בולגרי ספליט סקוואט', 3, 10),
  ('עלייה על מדרגה', 'legs', 'רגליים', 'various', 'עלייה על מדרגה', 3, 10),

  -- Hamstrings (10)
  ('כפיפת ברכיים בשכיבה', 'legs', 'רגליים', 'various', 'כפיפת ברכיים בשכיבה', 3, 10),
  ('כפיפת ברכיים בישיבה', 'legs', 'רגליים', 'various', 'כפיפת ברכיים בישיבה', 3, 10),
  ('כפיפת ברך בעמידה', 'legs', 'רגליים', 'various', 'כפיפת ברך בעמידה', 3, 10),
  ('דדליפט רומני במוט', 'legs', 'רגליים', 'various', 'דדליפט רומני במוט', 3, 10),
  ('דדליפט רומני בדאמבלים', 'legs', 'רגליים', 'various', 'דדליפט רומני בדאמבלים', 3, 10),
  ('דדליפט רומני חד־צדדי', 'legs', 'רגליים', 'various', 'דדליפט רומני חד־צדדי', 3, 10),
  ('גוד מורנינג', 'legs', 'רגליים', 'various', 'גוד מורנינג', 3, 10),
  ('נורדיק קרל', 'legs', 'רגליים', 'various', 'נורדיק קרל', 3, 10),
  ('כפיפת ברכיים עם כדור פיזיו', 'legs', 'רגליים', 'various', 'כפיפת ברכיים עם כדור פיזיו', 3, 10),
  ('כפיפת ברכיים בהחלקה על הרצפה', 'legs', 'רגליים', 'various', 'כפיפת ברכיים בהחלקה על הרצפה', 3, 10),

  -- Glutes (10)
  ('היפ תראסט במוט', 'legs', 'רגליים', 'various', 'היפ תראסט במוט', 3, 10),
  ('היפ תראסט במכונה', 'legs', 'רגליים', 'various', 'היפ תראסט במכונה', 3, 10),
  ('גשר ישבן', 'legs', 'רגליים', 'various', 'גשר ישבן', 3, 10),
  ('גשר ישבן חד־צדדי', 'legs', 'רגליים', 'various', 'גשר ישבן חד־צדדי', 3, 10),
  ('בעיטת ישבן בכבל', 'legs', 'רגליים', 'various', 'בעיטת ישבן בכבל', 3, 10),
  ('בעיטת ישבן במכונה', 'legs', 'רגליים', 'various', 'בעיטת ישבן במכונה', 3, 10),
  ('הרחקת ירך במכונה', 'legs', 'רגליים', 'various', 'הרחקת ירך במכונה', 3, 10),
  ('הרחקת ירך בכבל', 'legs', 'רגליים', 'various', 'הרחקת ירך בכבל', 3, 10),
  ('הליכה צידית עם גומייה', 'legs', 'רגליים', 'various', 'הליכה צידית עם גומייה', 3, 10),
  ('סומו סקוואט', 'legs', 'רגליים', 'various', 'סומו סקוואט', 3, 10),

  -- Calves (6)
  ('הרמת עקבים בעמידה במכונה', 'legs', 'רגליים', 'various', 'הרמת עקבים בעמידה במכונה', 3, 10),
  ('הרמת עקבים בישיבה', 'legs', 'רגליים', 'various', 'הרמת עקבים בישיבה', 3, 10),
  ('הרמת עקבים בלחיצת רגליים', 'legs', 'רגליים', 'various', 'הרמת עקבים בלחיצת רגליים', 3, 10),
  ('הרמת עקבים בעמידה עם דאמבלים', 'legs', 'רגליים', 'various', 'הרמת עקבים בעמידה עם דאמבלים', 3, 10),
  ('הרמת עקב חד־צדדית', 'legs', 'רגליים', 'various', 'הרמת עקב חד־צדדית', 3, 10),
  ('הרמת אצבעות כף הרגל', 'legs', 'רגליים', 'various', 'הרמת אצבעות כף הרגל', 3, 10),

  -- Core (15)
  ('פלאנק', 'core', 'שרירי ליבה', 'various', 'פלאנק', 3, 10),
  ('פלאנק צידי', 'core', 'שרירי ליבה', 'various', 'פלאנק צידי', 3, 10),
  ('פלאנק עם נגיעות כתף', 'core', 'שרירי ליבה', 'various', 'פלאנק עם נגיעות כתף', 3, 10),
  ('דד באג', 'core', 'שרירי ליבה', 'various', 'דד באג', 3, 10),
  ('בירד דוג', 'core', 'שרירי ליבה', 'various', 'בירד דוג', 3, 10),
  ('פאלוף פרס', 'core', 'שרירי ליבה', 'various', 'פאלוף פרס', 3, 10),
  ('פאלוף פרס בכריעה', 'core', 'שרירי ליבה', 'various', 'פאלוף פרס בכריעה', 3, 10),
  ('כפיפות בטן בכבל', 'core', 'שרירי ליבה', 'various', 'כפיפות בטן בכבל', 3, 10),
  ('כפיפות בטן במכונה', 'core', 'שרירי ליבה', 'various', 'כפיפות בטן במכונה', 3, 10),
  ('הרמת ברכיים בכיסא רומי', 'core', 'שרירי ליבה', 'various', 'הרמת ברכיים בכיסא רומי', 3, 10),
  ('הרמת רגליים בשכיבה', 'core', 'שרירי ליבה', 'various', 'הרמת רגליים בשכיבה', 3, 10),
  ('רולאאוט עם גלגל בטן', 'core', 'שרירי ליבה', 'various', 'רולאאוט עם גלגל בטן', 3, 10),
  ('נשיאת משקל ביד אחת', 'core', 'שרירי ליבה', 'various', 'נשיאת משקל ביד אחת', 3, 10),
  ('נשיאת משקל מעל הראש ביד אחת', 'core', 'שרירי ליבה', 'various', 'נשיאת משקל מעל הראש ביד אחת', 3, 10),
  ('סיבוב גו בכבל', 'core', 'שרירי ליבה', 'various', 'סיבוב גו בכבל', 3, 10),

  -- Functional / full body (8)
  ('דדליפט קלאסי', 'conditioning', 'אחר', 'various', 'דדליפט קלאסי', 3, 10),
  ('דדליפט סומו', 'conditioning', 'אחר', 'various', 'דדליפט סומו', 3, 10),
  ('דחיפת מזחלת', 'conditioning', 'אחר', 'various', 'דחיפת מזחלת', 3, 10),
  ('משיכת מזחלת', 'conditioning', 'אחר', 'various', 'משיכת מזחלת', 3, 10),
  ('הליכת חקלאי', 'conditioning', 'אחר', 'various', 'הליכת חקלאי', 3, 10),
  ('סווינג עם קטלבל', 'conditioning', 'אחר', 'various', 'סווינג עם קטלבל', 3, 10),
  ('סקוואט ולחיצה עם דאמבלים', 'conditioning', 'אחר', 'various', 'סקוואט ולחיצה עם דאמבלים', 3, 10),
  ('עלייה למדרגה עם משקולות', 'conditioning', 'אחר', 'various', 'עלייה למדרגה עם משקולות', 3, 10),

  -- Mobility / stability / rehab (15)
  ('משיכת גומייה לצדדים', 'mobility', 'מוביליטי', 'various', 'משיכת גומייה לצדדים', 3, 10),
  ('סיבוב כתף חיצוני עם גומייה', 'mobility', 'מוביליטי', 'various', 'סיבוב כתף חיצוני עם גומייה', 3, 10),
  ('סיבוב כתף פנימי עם גומייה', 'mobility', 'מוביליטי', 'various', 'סיבוב כתף פנימי עם גומייה', 3, 10),
  ('החלקת ידיים על קיר', 'mobility', 'מוביליטי', 'various', 'החלקת ידיים על קיר', 3, 10),
  ('הרחקת שכמות בעמידת שש', 'mobility', 'מוביליטי', 'various', 'הרחקת שכמות בעמידת שש', 3, 10),
  ('קירוב שכמות עם גומייה', 'mobility', 'מוביליטי', 'various', 'קירוב שכמות עם גומייה', 3, 10),
  ('מתיחת מכופפי הירך', 'mobility', 'מוביליטי', 'various', 'מתיחת מכופפי הירך', 3, 10),
  ('מתיחת הירך האחורית', 'mobility', 'מוביליטי', 'various', 'מתיחת הירך האחורית', 3, 10),
  ('מתיחת ארבע־ראשי', 'mobility', 'מוביליטי', 'various', 'מתיחת ארבע־ראשי', 3, 10),
  ('מתיחת התאומים', 'mobility', 'מוביליטי', 'various', 'מתיחת התאומים', 3, 10),
  ('סיבובי עמוד שדרה חזי', 'mobility', 'מוביליטי', 'various', 'סיבובי עמוד שדרה חזי', 3, 10),
  ('פתיחת בית חזה בשכיבה על הצד', 'mobility', 'מוביליטי', 'various', 'פתיחת בית חזה בשכיבה על הצד', 3, 10),
  ('תנועת חתול־פרה', 'mobility', 'מוביליטי', 'various', 'תנועת חתול־פרה', 3, 10),
  ('מוביליות קרסול מול קיר', 'mobility', 'מוביליטי', 'various', 'מוביליות קרסול מול קיר', 3, 10),
  ('הרחקת ירך בשכיבה על הצד', 'mobility', 'מוביליטי', 'various', 'הרחקת ירך בשכיבה על הצד', 3, 10);

INSERT INTO public.exercises
  (owner_id, name, category, muscle_group, equipment, description, default_sets, default_reps)
SELECT
  NULL,
  catalog.name,
  catalog.category,
  catalog.muscle_group,
  catalog.equipment,
  catalog.description,
  catalog.default_sets,
  catalog.default_reps
FROM tmp_core_150_catalog AS catalog
WHERE NOT EXISTS (
  SELECT 1
  FROM public.exercises AS existing
  WHERE existing.owner_id IS NULL
    AND existing.name = catalog.name
);

-- ---------------------------------------------------------------------------
-- 3. MERGE REFERENCES: opt-in only for manually verified duplicate UUID pairs.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE tmp_core_150_verified_merges (
  duplicate_id uuid PRIMARY KEY,
  canonical_id uuid NOT NULL UNIQUE,
  CHECK (duplicate_id <> canonical_id)
) ON COMMIT DROP;

-- Intentionally empty. Add only UUID pairs verified against the target database:
-- INSERT INTO tmp_core_150_verified_merges (duplicate_id, canonical_id) VALUES
--   ('duplicate-uuid', 'canonical-uuid');

DO $$
BEGIN
  -- A canonical target may never also be a duplicate source. This rejects
  -- A->B->C chains and every cycle before any reference is changed.
  IF EXISTS (
    SELECT 1
    FROM tmp_core_150_verified_merges current_merge
    JOIN tmp_core_150_verified_merges next_merge
      ON next_merge.duplicate_id = current_merge.canonical_id
  ) THEN
    RAISE EXCEPTION 'Core 150 merge aborted: merge chains and cycles are not allowed';
  END IF;

  -- Every supplied UUID must resolve to an existing shared exercise.
  IF EXISTS (
    SELECT 1
    FROM tmp_core_150_verified_merges m
    LEFT JOIN public.exercises duplicate ON duplicate.id = m.duplicate_id
    LEFT JOIN public.exercises canonical ON canonical.id = m.canonical_id
    WHERE duplicate.id IS NULL
       OR canonical.id IS NULL
       OR duplicate.owner_id IS NOT NULL
       OR canonical.owner_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Core 150 merge aborted: invalid or non-shared exercise UUID';
  END IF;

  -- Preserve the unique workout-set key after changing exercise_id.
  IF EXISTS (
    SELECT 1
    FROM tmp_core_150_verified_merges m
    JOIN public.workout_sets source ON source.exercise_id = m.duplicate_id
    JOIN public.workout_sets target
      ON target.exercise_id = m.canonical_id
     AND target.session_id IS NOT DISTINCT FROM source.session_id
     AND target.set_number = source.set_number
  ) THEN
    RAISE EXCEPTION 'Core 150 merge aborted: conflicting workout-set history';
  END IF;

  -- Do not silently create two copies of one exercise in a workout template.
  IF EXISTS (
    SELECT 1
    FROM tmp_core_150_verified_merges m
    JOIN public.workout_template_exercises source
      ON source.exercise_id = m.duplicate_id
    JOIN public.workout_template_exercises target
      ON target.exercise_id = m.canonical_id
     AND target.template_id = source.template_id
  ) THEN
    RAISE EXCEPTION 'Core 150 merge aborted: template contains both exercise IDs';
  END IF;
END;
$$;

-- Snapshot reference counts so postflight can prove that every configured
-- merge moved exactly the references that existed before the updates.
CREATE TEMP TABLE tmp_core_150_merge_audit (
  duplicate_id uuid PRIMARY KEY,
  canonical_id uuid NOT NULL UNIQUE,
  workout_duplicate_before bigint NOT NULL,
  workout_canonical_before bigint NOT NULL,
  template_duplicate_before bigint NOT NULL,
  template_canonical_before bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_core_150_merge_audit (
  duplicate_id,
  canonical_id,
  workout_duplicate_before,
  workout_canonical_before,
  template_duplicate_before,
  template_canonical_before
)
SELECT
  m.duplicate_id,
  m.canonical_id,
  (SELECT count(*) FROM public.workout_sets ws
   WHERE ws.exercise_id = m.duplicate_id),
  (SELECT count(*) FROM public.workout_sets ws
   WHERE ws.exercise_id = m.canonical_id),
  (SELECT count(*) FROM public.workout_template_exercises wte
   WHERE wte.exercise_id = m.duplicate_id),
  (SELECT count(*) FROM public.workout_template_exercises wte
   WHERE wte.exercise_id = m.canonical_id)
FROM tmp_core_150_verified_merges m;

UPDATE public.workout_sets AS ws
SET exercise_id = m.canonical_id
FROM tmp_core_150_verified_merges AS m
WHERE ws.exercise_id = m.duplicate_id;

UPDATE public.workout_template_exercises AS wte
SET exercise_id = m.canonical_id
FROM tmp_core_150_verified_merges AS m
WHERE wte.exercise_id = m.duplicate_id;

-- Deliberately no DELETE FROM public.exercises. A duplicate row remains present
-- even after its reviewed references are moved, preserving all exercise records.

-- ---------------------------------------------------------------------------
-- 4. POSTFLIGHT: fail the transaction if catalogue or merge invariants differ.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF (SELECT count(*) FROM tmp_core_150_catalog) <> 150 THEN
    RAISE EXCEPTION 'Core 150 postflight failed: catalogue must contain exactly 150 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_core_150_catalog catalog
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.exercises exercise
      WHERE exercise.owner_id IS NULL
        AND exercise.name = catalog.name
    )
  ) THEN
    RAISE EXCEPTION 'Core 150 postflight failed: one or more canonical exercises are missing';
  END IF;

  IF EXISTS (
    SELECT catalog.name
    FROM tmp_core_150_catalog catalog
    JOIN public.exercises exercise
      ON exercise.owner_id IS NULL
     AND exercise.name = catalog.name
    GROUP BY catalog.name
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Core 150 postflight failed: duplicate shared canonical exercise name';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_core_150_merge_audit audit
    WHERE (SELECT count(*) FROM public.workout_sets ws
           WHERE ws.exercise_id = audit.canonical_id)
            <> audit.workout_canonical_before + audit.workout_duplicate_before
       OR (SELECT count(*) FROM public.workout_template_exercises wte
           WHERE wte.exercise_id = audit.canonical_id)
            <> audit.template_canonical_before + audit.template_duplicate_before
  ) THEN
    RAISE EXCEPTION 'Core 150 postflight failed: not all references reached canonical IDs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_core_150_merge_audit audit
    WHERE EXISTS (
      SELECT 1 FROM public.workout_sets ws
      WHERE ws.exercise_id = audit.duplicate_id
    )
       OR EXISTS (
      SELECT 1 FROM public.workout_template_exercises wte
      WHERE wte.exercise_id = audit.duplicate_id
    )
  ) THEN
    RAISE EXCEPTION 'Core 150 postflight failed: references remain on duplicate IDs';
  END IF;
END;
$$;

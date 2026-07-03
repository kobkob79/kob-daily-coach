
-- Translate common English exercise names to Hebrew and normalize muscle groups.
-- Only touches shared library rows (owner_id IS NULL) plus any user rows that
-- still hold the exact English label. Idempotent.

UPDATE public.exercises SET name = CASE lower(trim(name))
  WHEN 'chest press'          THEN 'לחיצת חזה במכונה'
  WHEN 'bench press'          THEN 'לחיצת חזה במוט'
  WHEN 'incline bench press'  THEN 'לחיצת חזה בשיפוע'
  WHEN 'dumbbell press'       THEN 'לחיצת חזה עם משקולות'
  WHEN 'chest fly'            THEN 'פרפר לחזה'
  WHEN 'pec deck'             THEN 'פרפר במכונה'
  WHEN 'push up'              THEN 'שכיבות סמיכה'
  WHEN 'push-up'              THEN 'שכיבות סמיכה'
  WHEN 'lat pulldown'         THEN 'פולי עליון'
  WHEN 'pull up'              THEN 'מתח'
  WHEN 'pull-up'              THEN 'מתח'
  WHEN 'seated row'           THEN 'חתירה בישיבה'
  WHEN 'cable row'            THEN 'חתירה בכבל'
  WHEN 'barbell row'          THEN 'חתירה במוט'
  WHEN 'dumbbell row'         THEN 'חתירה חד־ידית'
  WHEN 'deadlift'             THEN 'דדליפט'
  WHEN 'romanian deadlift'    THEN 'דדליפט רומני'
  WHEN 'shoulder press'       THEN 'לחיצת כתפיים'
  WHEN 'overhead press'       THEN 'לחיצת כתפיים במוט'
  WHEN 'lateral raise'        THEN 'הרחקת כתפיים'
  WHEN 'front raise'          THEN 'הרמות קדמיות'
  WHEN 'rear delt fly'        THEN 'פרפר אחורי'
  WHEN 'bicep curl'           THEN 'כפיפת מרפקים'
  WHEN 'biceps curl'          THEN 'כפיפת מרפקים'
  WHEN 'hammer curl'          THEN 'כפיפת פטיש'
  WHEN 'tricep pushdown'      THEN 'פשיטת מרפקים בפולי'
  WHEN 'triceps pushdown'     THEN 'פשיטת מרפקים בפולי'
  WHEN 'tricep extension'     THEN 'פשיטת מרפקים'
  WHEN 'leg press'            THEN 'לחיצת רגליים'
  WHEN 'leg extension'        THEN 'פשיטת ברכיים'
  WHEN 'leg curl'             THEN 'כפיפת ברכיים'
  WHEN 'squat'                THEN 'סקוואט'
  WHEN 'back squat'           THEN 'סקוואט אחורי'
  WHEN 'front squat'          THEN 'סקוואט קדמי'
  WHEN 'goblet squat'         THEN 'סקוואט גביע'
  WHEN 'lunge'                THEN 'לאנג׳'
  WHEN 'walking lunge'        THEN 'לאנג׳ בהליכה'
  WHEN 'hip thrust'           THEN 'היפ ת׳ראסט'
  WHEN 'calf raise'           THEN 'הרמת עקבים'
  WHEN 'seated calf raise'    THEN 'הרמת עקבים בישיבה'
  WHEN 'plank'                THEN 'פלאנק'
  WHEN 'side plank'           THEN 'פלאנק צד'
  WHEN 'sit up'               THEN 'כפיפות בטן'
  WHEN 'crunch'               THEN 'כפיפות בטן'
  WHEN 'hanging leg raise'    THEN 'הרמת רגליים בתלייה'
  WHEN 'russian twist'        THEN 'טוויסט רוסי'
  WHEN 'treadmill'            THEN 'הליכון'
  WHEN 'stationary bike'      THEN 'אופני כושר'
  WHEN 'elliptical'           THEN 'אליפטיקל'
  WHEN 'rowing machine'       THEN 'ארגומטר חתירה'
  WHEN 'stretching'           THEN 'מתיחות'
  WHEN 'mobility'             THEN 'תרגילי מוביליטי'
  ELSE name
END
WHERE lower(trim(name)) IN (
  'chest press','bench press','incline bench press','dumbbell press','chest fly','pec deck',
  'push up','push-up','lat pulldown','pull up','pull-up','seated row','cable row','barbell row',
  'dumbbell row','deadlift','romanian deadlift','shoulder press','overhead press','lateral raise',
  'front raise','rear delt fly','bicep curl','biceps curl','hammer curl','tricep pushdown',
  'triceps pushdown','tricep extension','leg press','leg extension','leg curl','squat',
  'back squat','front squat','goblet squat','lunge','walking lunge','hip thrust','calf raise',
  'seated calf raise','plank','side plank','sit up','crunch','hanging leg raise','russian twist',
  'treadmill','stationary bike','elliptical','rowing machine','stretching','mobility'
);

-- Seed a shared Hebrew starter library (owner_id NULL = visible to all users).
-- Skip inserts whose Hebrew name already exists to keep this migration idempotent.
INSERT INTO public.exercises (name, muscle_group, category, owner_id)
SELECT v.name, v.muscle_group, 'core', NULL
FROM (VALUES
  ('לחיצת חזה במכונה','חזה'),
  ('לחיצת חזה במוט','חזה'),
  ('פרפר לחזה','חזה'),
  ('שכיבות סמיכה','חזה'),
  ('פולי עליון','גב'),
  ('חתירה בישיבה','גב'),
  ('חתירה במוט','גב'),
  ('מתח','גב'),
  ('דדליפט','גב'),
  ('לחיצת כתפיים','כתפיים'),
  ('הרחקת כתפיים','כתפיים'),
  ('הרמות קדמיות','כתפיים'),
  ('פרפר אחורי','כתפיים'),
  ('כפיפת מרפקים','יד קדמית'),
  ('כפיפת פטיש','יד קדמית'),
  ('פשיטת מרפקים בפולי','יד אחורית'),
  ('פשיטת מרפקים','יד אחורית'),
  ('סקוואט','רגליים'),
  ('לחיצת רגליים','רגליים'),
  ('פשיטת ברכיים','רגליים'),
  ('כפיפת ברכיים','רגליים'),
  ('לאנג׳','רגליים'),
  ('היפ ת׳ראסט','רגליים'),
  ('הרמת עקבים','רגליים'),
  ('פלאנק','שרירי ליבה'),
  ('כפיפות בטן','בטן'),
  ('הרמת רגליים בתלייה','בטן'),
  ('טוויסט רוסי','שרירי ליבה'),
  ('הליכון','קרדיו'),
  ('אופני כושר','קרדיו'),
  ('אליפטיקל','קרדיו'),
  ('ארגומטר חתירה','קרדיו'),
  ('מתיחות','מוביליטי'),
  ('תרגילי מוביליטי','מוביליטי')
) AS v(name, muscle_group)
WHERE NOT EXISTS (
  SELECT 1 FROM public.exercises e
  WHERE e.name = v.name AND e.owner_id IS NULL
);

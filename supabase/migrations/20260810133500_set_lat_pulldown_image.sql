UPDATE public.exercises
SET image_path = '/images/exercises/Back/lat-pulldown.jpeg'
WHERE owner_id IS NULL
  AND lower(trim(name)) IN ('lat pulldown', 'פולי עליון');
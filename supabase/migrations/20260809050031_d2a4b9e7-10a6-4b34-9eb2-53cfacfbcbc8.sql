CREATE OR REPLACE FUNCTION public.increment_meal_favorite_use(_favorite_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.meal_favorites
  SET use_count = use_count + 1
  WHERE id = _favorite_id
    AND user_id = auth.uid()
  RETURNING use_count;
$$;

GRANT EXECUTE ON FUNCTION public.increment_meal_favorite_use(uuid) TO authenticated;
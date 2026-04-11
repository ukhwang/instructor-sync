-- 차감 RPC도 클라이언트 user_id 신뢰 제거 + 음수 방지 (increment_credit와 대칭)
DROP FUNCTION IF EXISTS public.decrement_credit(uuid);

CREATE OR REPLACE FUNCTION public.decrement_credit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits - 1
  WHERE id = auth.uid()
    AND credits > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_credit() TO authenticated;

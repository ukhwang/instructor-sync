-- 이미 increment_credit(uuid)를 배포한 경우에만 필요한 보안 패치.
-- 신규 환경은 20260411120000 마이그레이션에 동일 로직이 포함됨.

DROP FUNCTION IF EXISTS public.increment_credit(uuid);

CREATE OR REPLACE FUNCTION public.increment_credit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits + 1
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_credit() TO authenticated;

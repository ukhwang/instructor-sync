-- gap_items: 패치·상세 화면용 컬럼 (Supabase SQL Editor 또는 CLI로 적용)
ALTER TABLE public.gap_items
  ADD COLUMN IF NOT EXISTS migrated_code text,
  ADD COLUMN IF NOT EXISTS cell_index integer,
  ADD COLUMN IF NOT EXISTS page_number integer;

-- 기존 meta JSON에만 있던 값을 컬럼으로 백필 (숫자 문자열만 안전 변환)
UPDATE public.gap_items
SET cell_index = COALESCE(cell_index, (meta ->> 'cellIndex')::integer)
WHERE meta IS NOT NULL
  AND cell_index IS NULL
  AND (meta ? 'cellIndex')
  AND (meta ->> 'cellIndex') ~ '^-?[0-9]+$';

UPDATE public.gap_items
SET page_number = COALESCE(page_number, (meta ->> 'pageNumber')::integer)
WHERE meta IS NOT NULL
  AND page_number IS NULL
  AND (meta ? 'pageNumber')
  AND (meta ->> 'pageNumber') ~ '^-?[0-9]+$';

-- 분석 실패 시 크레딧 복구용 (클라이언트가 넘긴 user_id는 신뢰하지 않음 — auth.uid()만 사용)
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

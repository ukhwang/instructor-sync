-- 숙제 1건당 동작 상한 3 → 20. (필수 ≥ 1 규칙은 create_homework_v2 가 그대로 유지)
-- 기존 숙제·동작 데이터는 모두 유효하며 값은 바뀌지 않는다 (제약만 완화).
--
-- 함수 본문은 복사하지 않고 DB에 실제로 적용된 정의를 읽어 상한 표현만 치환한다.
-- 치환이 일어나지 않으면 예외로 전체를 롤백해, 정의가 달라진 환경에서 조용히 넘어가지 않는다.

ALTER TABLE public.homework_items DROP CONSTRAINT IF EXISTS homework_items_order_index_check;
ALTER TABLE public.homework_items
  ADD CONSTRAINT homework_items_order_index_check CHECK (order_index BETWEEN 1 AND 20);

DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.create_homework(uuid,text,text,timestamptz,jsonb)'::regprocedure);
  v_new := replace(v_def, 'NOT BETWEEN 1 AND 3', 'NOT BETWEEN 1 AND 20');
  v_new := replace(v_new, '''^[1-3]$''', '''^([1-9]|1[0-9]|20)$''');
  IF v_new = v_def OR v_new LIKE '%BETWEEN 1 AND 3%' OR v_new LIKE '%[1-3]%' THEN
    RAISE EXCEPTION 'create_homework: item limit expressions not found as expected';
  END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.create_homework_v2(uuid,uuid,text,text,timestamptz,jsonb,text,integer,uuid)'::regprocedure);
  v_new := replace(v_def, '''^[1-3]$''', '''^([1-9]|1[0-9]|20)$''');
  IF v_new = v_def OR v_new LIKE '%[1-3]%' THEN
    RAISE EXCEPTION 'create_homework_v2: item limit expression not found as expected';
  END IF;
  EXECUTE v_new;
END
$$;

-- Rollback: 상한 20 으로 저장된 숙제가 없을 때만
--   ALTER TABLE public.homework_items DROP CONSTRAINT homework_items_order_index_check;
--   ALTER TABLE public.homework_items ADD CONSTRAINT homework_items_order_index_check CHECK (order_index BETWEEN 1 AND 3);
-- 그리고 위 두 함수를 20260921075052 / 20260921171403 의 정의로 다시 적용한다.

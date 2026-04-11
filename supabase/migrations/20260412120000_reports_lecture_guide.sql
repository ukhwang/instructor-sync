-- reports: AI 교수 설계자 모듈 결과 저장 (JSON)
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS lecture_guide jsonb;

COMMENT ON COLUMN public.reports.lecture_guide IS 'Optional instructional-design hints: emphasis, analogies, faq, quickLab';

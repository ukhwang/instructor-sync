"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/* 데모 화면 전용 뷰 훅. 프로덕션 스케줄 훅은 서버 액션에 묶여 있어 재사용하지 않는다. */

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** 모바일(일간 뷰)로 시작하고 브라우저 폭에 맞춘다. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}

/** 1분마다 갱신되는 현재 시각 (뱃지·현재선·다음 수업 카드용) */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

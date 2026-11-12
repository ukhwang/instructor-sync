import { kstMinutesOfDay, type HomeworkBadge } from "./schedule-schemas";

/* 서버·클라이언트 공용 표시 상수 ("use client" 모듈 밖에 두어야 Server Component 에서 값으로 쓸 수 있다) */

export const BADGE_META: Record<HomeworkBadge, { label: string; dot: string; block: string; chip: string }> = {
  pain: {
    label: "통증 주의",
    dot: "bg-rose-500",
    block: "border-rose-500 bg-rose-50 text-rose-950",
    chip: "bg-rose-100 text-rose-700",
  },
  done: {
    label: "숙제 완료",
    dot: "bg-emerald-500",
    block: "border-emerald-500 bg-emerald-50 text-emerald-950",
    chip: "bg-emerald-100 text-emerald-700",
  },
  in_progress: {
    label: "숙제 진행 중",
    dot: "bg-amber-400",
    block: "border-amber-400 bg-amber-50 text-amber-950",
    chip: "bg-amber-100 text-amber-800",
  },
  none: {
    label: "숙제 없음",
    dot: "bg-slate-300",
    block: "border-slate-300 bg-white text-slate-900",
    chip: "bg-slate-100 text-slate-600",
  },
};

export function formatTime(iso: string): string {
  const minutes = kstMinutesOfDay(iso);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}


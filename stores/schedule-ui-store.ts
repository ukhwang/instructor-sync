import { create } from "zustand";

/**
 * 스케줄러 "UI 전용" 상태.
 * 수업·회원·숙제 같은 서버 데이터는 절대 여기에 두지 않는다 (TanStack Query 가 소유).
 * 주(week)는 URL(?week=) 이 소유한다.
 */

export type ScheduleSheet =
  | { kind: "none" }
  | { kind: "create"; date: string; minute: number }
  | { kind: "detail"; lessonId: string };

export interface AssignTarget {
  lessonId: string;
  memberId: string;
  label: string;
}

interface ScheduleUiState {
  /** 모바일 일간 뷰에서 보고 있는 요일 (0=월 … 6=일) */
  activeDayIndex: number;
  sheet: ScheduleSheet;
  /** 수업 완료 직후 원루프 숙제 출제 대상 */
  assignTarget: AssignTarget | null;
  setActiveDayIndex: (index: number) => void;
  openCreate: (date: string, minute: number) => void;
  openDetail: (lessonId: string) => void;
  closeSheet: () => void;
  openAssign: (target: AssignTarget) => void;
  closeAssign: () => void;
}

export const useScheduleUiStore = create<ScheduleUiState>((set) => ({
  activeDayIndex: 0,
  sheet: { kind: "none" },
  assignTarget: null,
  setActiveDayIndex: (index) => set({ activeDayIndex: Math.min(6, Math.max(0, index)) }),
  openCreate: (date, minute) => set({ sheet: { kind: "create", date, minute } }),
  openDetail: (lessonId) => set({ sheet: { kind: "detail", lessonId } }),
  closeSheet: () => set({ sheet: { kind: "none" } }),
  openAssign: (target) => set({ assignTarget: target, sheet: { kind: "none" } }),
  closeAssign: () => set({ assignTarget: null }),
}));

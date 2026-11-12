import type { Metadata } from "next";

import { ScheduleScreen } from "@/components/schedules/ScheduleScreen";
import { getMembers } from "@/lib/db-server";
import { getWeekBoard } from "@/lib/schedule-server";
import { mondayOf, weekStartSchema, type WeekBoard } from "@/lib/schedule-schemas";
import type { Member } from "@/lib/types";

export const metadata: Metadata = {
  title: "주간 스케줄 — 운동숙제",
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[]; lesson?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedWeek = typeof params.week === "string" ? params.week : null;
  const parsedWeek = requestedWeek ? weekStartSchema.safeParse(requestedWeek) : null;
  const weekStart = parsedWeek?.success ? parsedWeek.data : mondayOf(new Date());
  const lessonParam = typeof params.lesson === "string" && UUID_PATTERN.test(params.lesson) ? params.lesson : null;

  // 독립 조회는 병렬로. 실패는 숨기지 않고 화면에 "다시 불러오기"로 보여준다.
  const [boardResult, membersResult] = await Promise.allSettled([getWeekBoard(weekStart), getMembers()]);

  const initialBoard: WeekBoard | null = boardResult.status === "fulfilled" ? boardResult.value : null;
  const initialError = boardResult.status === "rejected" ? "스케줄을 불러오지 못했어요. 로그인 상태를 확인해주세요." : null;
  const members: Member[] = membersResult.status === "fulfilled" ? membersResult.value : [];

  return (
    <ScheduleScreen
      initialWeekStart={weekStart}
      initialBoard={initialBoard}
      initialError={initialError}
      members={members}
      initialLessonId={lessonParam}
    />
  );
}

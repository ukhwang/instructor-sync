import Link from "next/link";
import { getMembers, getAllHomeworks } from "@/lib/db-server";
import { getSeoulDateTimeString } from "@/lib/token";
import { buildCareQueue, CARE_QUEUE_LABELS } from "@/lib/care-queue";
import { QuickAssignTrigger } from "@/components/homework/QuickAssignTrigger";
import { getMemberBriefing } from "@/lib/briefing/service";
import { SessionBriefingCard } from "@/components/briefing/SessionBriefingCard";
import { getTodayLessons } from "@/lib/schedule-server";
import type { LessonBlock } from "@/lib/schedule-schemas";
import { BADGE_META, formatTime } from "@/lib/schedule-display";

export const dynamic = "force-dynamic";

function pickNextLesson(lessons: LessonBlock[]): LessonBlock | null {
  const nowMs = Date.now();
  return lessons.find((lesson) => lesson.status === "scheduled" && Date.parse(lesson.endsAt) > nowMs) ?? null;
}

export default async function TrainerDashboardPage() {
  // These authenticated Supabase reads are independent. Starting them together
  // removes one network round trip from the dashboard's server-render time.
  // 스케줄 조회 실패(마이그레이션 미적용 등)는 대시보드를 막지 않는다.
  const [members, homeworks, todayLessons] = await Promise.all([
    getMembers(),
    getAllHomeworks(),
    getTodayLessons().catch((): LessonBlock[] => []),
  ]);
  const careQueue = buildCareQueue(members, homeworks);

  // 3초 브리핑 대상: 오늘 아직 끝나지 않은 다음 수업 회원 → 없으면 케어 큐 1순위
  const nextLesson = pickNextLesson(todayLessons);
  const primaryMemberId = nextLesson?.memberId ?? careQueue[0]?.member?.id ?? members[0]?.id ?? null;
  const primaryBriefing = primaryMemberId ? await getMemberBriefing(primaryMemberId) : null;

  // Calculate Funnel Metrics
  const totalMembers = members.length;
  const expiringMembers = members.filter((m) => (m.package_remaining ?? 0) <= 4);
  const totalHomeworks = homeworks.length;
  
  const openedHomeworks = homeworks.filter(
    (h) => h.status === "opened" || h.status === "logged"
  ).length;
  const loggedHomeworks = homeworks.filter((h) => h.status === "logged").length;

  const openRate =
    totalHomeworks > 0 ? Math.round((openedHomeworks / totalHomeworks) * 100) : 0;
  const logRate =
    openedHomeworks > 0 ? Math.round((loggedHomeworks / openedHomeworks) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="brutalist-box p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-xs font-bold text-neutral-600 mb-1">
            강사 홈 대시보드
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            강사님의 수업 연결 현황
          </h1>
          <p className="text-sm font-medium text-neutral-700 mt-1">
            수업 전 회원의 기록을 확인하고, 자연스럽게 대화를 시작하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <QuickAssignTrigger members={members} />
          <Link
            href="/app/members"
            className="brutalist-btn-secondary text-sm font-bold"
          >
            회원 추가
          </Link>
        </div>
      </div>

      {/* 오늘 수업 (스케줄러) */}
      <section aria-label="오늘 수업" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">오늘 수업 {todayLessons.length > 0 && <span className="text-[var(--ui-accent)]">{todayLessons.length}</span>}</h2>
          <Link href="/app/schedules" className="text-sm font-bold text-[var(--ui-accent)]">
            주간 스케줄 →
          </Link>
        </div>
        {todayLessons.length === 0 ? (
          <Link
            href="/app/schedules"
            className="brutalist-box-sm flex min-h-16 items-center justify-center bg-white p-4 text-sm font-semibold text-neutral-600"
          >
            오늘 예약된 수업이 없어요. 스케줄에서 빈 시간을 눌러 예약하세요.
          </Link>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {todayLessons.map((lesson) => {
              const meta = BADGE_META[lesson.badge];
              const done = lesson.status !== "scheduled";
              return (
                <li key={lesson.id}>
                  <Link
                    href={`/app/schedules?lesson=${lesson.id}`}
                    className={`brutalist-box-sm flex min-h-16 items-center gap-3 bg-white p-3 transition-transform active:scale-[0.98] ${done ? "opacity-60" : ""}`}
                  >
                    <span className="font-mono text-sm font-bold tabular-nums">{formatTime(lesson.startsAt)}</span>
                    <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{lesson.memberName}님</span>
                      <span className="block truncate text-xs text-neutral-500">{lesson.homeworkSummary}</span>
                    </span>
                    {lesson.status === "completed" && <span className="text-xs font-bold text-emerald-600">완료</span>}
                    {lesson.status === "no_show" && <span className="text-xs font-bold text-neutral-500">노쇼</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3초 AI 수업 브리핑 카드 */}
      {primaryBriefing && (
        <section aria-label="수업 전 3초 AI 브리핑" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">
              {nextLesson ? `${formatTime(nextLesson.startsAt)} 수업 3초 브리핑` : "수업 전 3초 브리핑"}
            </h2>
            <span className="text-xs font-mono text-neutral-500">
              {primaryBriefing.source === "live" ? "회원 기록 기반" : "샘플 데이터"}
            </span>
          </div>
          <SessionBriefingCard briefing={primaryBriefing} variant="dashboard" />
        </section>
      )}

      {/* Funnel Metrics Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold tracking-tight">오늘의 흐름</h2>
          <span className="text-xs font-mono text-neutral-600">
            실시간 집계
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="brutalist-box-sm p-4 bg-white">
            <div className="text-xs font-mono font-bold text-neutral-600">
              전체 관리 회원
            </div>
            <div className="text-2xl sm:text-3xl font-black mt-1">
              {totalMembers}
              <span className="text-xs font-normal text-neutral-500 ml-1">명</span>
            </div>
          </div>

          <div className="brutalist-box-sm p-4 bg-white">
            <div className="text-xs font-mono font-bold text-neutral-600">
              링크 오픈율
            </div>
            <div className="text-2xl sm:text-3xl font-black mt-1">
              {openRate}
              <span className="text-xs font-normal text-neutral-500 ml-1">%</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-1">
              {openedHomeworks}/{totalHomeworks}건 열람
            </div>
          </div>

          <div className="brutalist-box-sm p-4 bg-white">
            <div className="text-xs font-mono font-bold text-neutral-600">
              오픈 후 기록률
            </div>
            <div className="text-2xl sm:text-3xl font-black mt-1">
              {logRate}
              <span className="text-xs font-normal text-neutral-500 ml-1">%</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-1">
              완료+못함 제출 비율
            </div>
          </div>

          <div className="brutalist-box-sm p-4 bg-white border-l-4 border-l-black">
            <div className="text-xs font-mono font-bold text-neutral-600">
              숙제 응답
            </div>
            <div className="text-2xl sm:text-3xl font-black mt-1 text-black">
              {loggedHomeworks}
              <span className="text-xs font-normal text-neutral-500 ml-1">건</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-1">
              오프닝 멘트 준비됨
            </div>
          </div>

          <Link
            href="/app/renewals"
            className="brutalist-box-sm p-4 bg-yellow-100 hover:bg-yellow-200 transition-colors block cursor-pointer"
          >
            <div className="text-xs font-mono font-bold text-yellow-900">
              만료 임박 (잔여≤4)
            </div>
            <div className="text-2xl sm:text-3xl font-black mt-1 text-yellow-950">
              {expiringMembers.length}
              <span className="text-xs font-normal text-neutral-600 ml-1">명</span>
            </div>
            <div className="text-[11px] font-mono text-yellow-800 font-bold mt-1">
              상담 카드 보기 →
            </div>
          </Link>
        </div>
      </div>

      {/* Rule-based consultation and care queue */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-black tracking-tight">상담/케어 큐</h2>
            <p className="text-xs text-neutral-600 font-medium mt-0.5">
              잔여 수업과 최근 14일 숙제 기록을 기준으로 확인할 회원입니다.
            </p>
          </div>
          <span className="text-xs font-mono text-neutral-600">
            확인 필요 {careQueue.length}명
          </span>
        </div>

        {careQueue.length === 0 ? (
          <div className="brutalist-box-sm p-5 bg-white text-sm font-bold text-neutral-600">
            현재 확인이 필요한 회원이 없습니다.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {careQueue.map((entry) => (
              <div
                key={entry.member.id}
                className="brutalist-box-sm p-4 bg-white border-l-4 border-l-yellow-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/app/members/${entry.member.id}`}
                      className="font-black hover:underline"
                    >
                      {entry.member.name}
                    </Link>
                    <div className="text-[11px] font-mono text-neutral-600 mt-1">
                      잔여 {entry.member.package_remaining}회 / 총 {entry.member.package_total}회
                    </div>
                  </div>
                  {entry.completionRate !== null && (
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black">{entry.completionRate}%</div>
                      <div className="text-[10px] font-mono text-neutral-500">
                        14일 수행률
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {entry.reasons.map((reason) => (
                    <span
                      key={reason}
                      className="text-[11px] font-bold border border-black bg-yellow-100 px-2 py-0.5"
                    >
                      {CARE_QUEUE_LABELS[reason]}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-neutral-300">
                  <span className="text-[11px] text-neutral-600">
                    최근 숙제 {entry.completedCount}/{entry.assignedCount}건 수행
                  </span>
                  <Link
                    href={
                      entry.reasons.includes("consultation")
                        ? "/app/renewals"
                        : `/app/session/${entry.member.id}`
                    }
                    className="text-xs font-black underline underline-offset-2"
                  >
                    확인하기 →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Homeworks Section */}
      <div className="brutalist-box p-6 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b-2 border-black">
          <div>
            <h2 className="text-xl font-semibold">최근 활동</h2>
            <p className="text-xs text-neutral-600 font-medium mt-0.5">
              회원이 기록을 남기면 즉시 다음 수업 오프닝 멘트가 완성됩니다.
            </p>
          </div>
          <Link
            href="/app/homework/new"
            className="text-xs font-bold px-3 py-1.5 border-2 border-black bg-black text-white hover:bg-neutral-800"
          >
            + 숙제 링크 생성
          </Link>
        </div>

        {homeworks.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-base font-bold text-neutral-600 mb-4">
              아직 발송된 숙제가 없습니다.
            </p>
            <Link
              href="/app/homework/new"
              className="brutalist-btn-yellow text-sm font-black"
            >
              첫 숙제 링크 만들기 (2분 완성)
            </Link>
          </div>
        ) : (
          <div className="divide-y-2 divide-neutral-200">
            {homeworks.map((hw) => {
              const statusBadges: Record<string, { label: string; bg: string }> = {
                draft: { label: "초안", bg: "bg-neutral-200 text-neutral-800" },
                sent: { label: "링크 발송됨", bg: "bg-blue-100 text-blue-900" },
                opened: { label: "회원 열람함", bg: "bg-purple-100 text-purple-900" },
                logged: { label: "기록 제출 완료", bg: "bg-green-200 text-green-950 font-bold" },
                revoked: { label: "링크 무효화됨", bg: "bg-neutral-300 text-neutral-600" },
              };
              const badge = statusBadges[hw.status] || statusBadges.sent;

              return (
                <div
                  key={hw.id}
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50 px-2 -mx-2 transition-colors"
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black">
                        {hw.member?.name || "회원"}
                      </span>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 border border-black ${badge.bg}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs font-mono text-neutral-500">
                        {hw.created_at ? getSeoulDateTimeString(hw.created_at) : ""}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-neutral-800 line-clamp-1">
                      <span className="font-mono text-xs bg-neutral-100 border border-neutral-300 px-1 py-0.2 mr-1.5">
                        이유
                      </span>
                      {hw.why}
                    </p>

                    {hw.items && hw.items.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 text-xs text-neutral-600">
                        {hw.items.map((item, idx) => (
                          <span
                            key={idx}
                            className="bg-white border border-neutral-400 px-2 py-0.5 font-medium"
                          >
                            {item.name} ({item.target_sets}세트 {item.target_reps})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/app/session/${hw.member_id}`}
                      className="text-xs font-black px-3 py-1.5 border-2 border-black bg-yellow-400 hover:bg-yellow-300 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5"
                    >
                      수업 준비 보기
                    </Link>
                    <Link
                      href={`/app/homework/${hw.id}`}
                      className="text-xs font-bold px-3 py-1.5 border-2 border-black bg-white hover:bg-neutral-100"
                    >
                      상세/링크
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

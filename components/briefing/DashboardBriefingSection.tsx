import { SessionBriefingCard } from "@/components/briefing/SessionBriefingCard";
import { getMemberBriefing } from "@/lib/briefing/service";

/**
 * 대시보드 3초 브리핑 (Server Component).
 * 페이지 본문과 분리해 <Suspense> 로 스트리밍한다 → 브리핑 조회가 대시보드 첫 페인트를 막지 않는다.
 * 조회 실패는 샘플로 위장하지 않고 실패 상태로 보여준다.
 */
export async function DashboardBriefingSection({ memberId, title }: { memberId: string; title: string }) {
  let briefing: Awaited<ReturnType<typeof getMemberBriefing>> | null = null;
  try {
    briefing = await getMemberBriefing(memberId);
  } catch {
    briefing = null;
  }

  return (
    <section aria-label="수업 전 3초 AI 브리핑" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {briefing && (
          <span className="text-xs font-mono text-neutral-500">
            {briefing.source === "live" ? "회원 기록 기반" : "샘플 데이터"}
          </span>
        )}
      </div>
      {briefing ? (
        <SessionBriefingCard briefing={briefing} variant="dashboard" />
      ) : (
        <p role="alert" className="brutalist-box-sm bg-white p-4 text-sm font-semibold text-rose-700">
          브리핑을 불러오지 못했어요. 잠시 후 새로고침 해주세요.
        </p>
      )}
    </section>
  );
}

export function DashboardBriefingSkeleton({ title }: { title: string }) {
  return (
    <section aria-label="수업 전 3초 AI 브리핑" aria-busy="true" className="space-y-2">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="h-40 animate-pulse rounded-2xl bg-zinc-900/90" />
    </section>
  );
}

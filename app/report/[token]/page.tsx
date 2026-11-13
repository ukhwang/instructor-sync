import type { Metadata } from "next";

import { MilestoneReportCard } from "@/components/milestone/MilestoneReportCard";
import { COPY } from "@/lib/copy";
import { SAMPLE_REPORT_TOKEN, buildMilestoneView, buildSampleReport } from "@/lib/milestone-report";
import { openMilestoneReport } from "@/lib/milestone-server";

export const metadata: Metadata = {
  title: "운동숙제 — 마일스톤 리포트",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const FAILURE_MESSAGE = {
  not_found: "링크가 올바르지 않아요. 담당 원장님께 새 링크를 받아주세요.",
  revoked: "원장님이 이 리포트 링크를 회수했어요.",
  expired: "리포트 링크 기간(30일)이 지났어요. 담당 원장님께 새 링크를 받아주세요.",
  unavailable: "잠시 리포트를 불러오지 못했어요. 조금 뒤 다시 열어주세요.",
} as const;

export default async function MilestoneReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const isSample = token === SAMPLE_REPORT_TOKEN;
  const outcome = isSample
    ? ({ ok: true, report: buildSampleReport() } as const)
    : await openMilestoneReport(token);

  if (!outcome.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F172A] p-4 text-white">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center">
          <h1 className="text-xl font-bold">리포트를 열 수 없어요</h1>
          <p className="text-base text-slate-300">{FAILURE_MESSAGE[outcome.reason]}</p>
        </div>
      </div>
    );
  }

  const view = buildMilestoneView(outcome.report);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#0F172A] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <MilestoneReportCard
          member={{ name: view.memberName }}
          homeworks={view.homeworks}
          logs={view.logs}
          aiSummary={view.summary}
          reportToken={token}
          studioName={view.studioName}
          sessionNumber={view.sessionNumber}
          hideShareButton
          sampleNotice={isSample ? "시연용 샘플 리포트예요. 실제 회원의 기록이 아니에요." : undefined}
        />
      </div>
      <footer className="mx-auto w-full max-w-xl pt-8 text-center">
        <p className="font-mono text-xs text-slate-400">
          {view.studioName} · {COPY.BRAND_NAME} · 회원이 직접 남긴 기록으로 만든 리포트
        </p>
      </footer>
    </div>
  );
}

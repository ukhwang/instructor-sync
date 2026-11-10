import { Metadata } from "next";
import { getMilestoneReportAction } from "@/app/actions/report";
import { MilestoneReportCard } from "@/components/milestone/MilestoneReportCard";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = {
  title: "운동숙제 — 10회차 마일스톤 성과 리포트",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function MilestoneReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const token = resolvedParams.token;

  // token 형식: rep-{memberId}-{timestamp}
  const parts = token.split("-");
  const memberId = parts.length >= 2 ? parts[1] : "demo-member";

  try {
    const reportData = await getMilestoneReportAction(memberId);

    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex flex-col justify-between py-8 px-4">
        <div className="max-w-xl w-full mx-auto space-y-6">
          <MilestoneReportCard
            member={reportData.member}
            homeworks={reportData.homeworks}
            logs={reportData.logs}
            aiSummary={reportData.aiSummary}
            reportToken={token}
            studioName={reportData.studioName}
            sessionNumber={reportData.sessionNumber}
            focusPainArea={reportData.focusPainArea}
            hideShareButton={true}
          />
        </div>

        <footer className="max-w-xl w-full mx-auto pt-8 text-center">
          <p className="text-xs font-mono text-slate-400">
            {reportData.studioName} · {COPY.BRAND_NAME}
          </p>
        </footer>
      </div>
    );
  } catch {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full p-6 bg-slate-800 rounded-2xl text-center space-y-4 border border-slate-700">
          <h1 className="text-xl font-bold">리포트를 찾을 수 없습니다</h1>
          <p className="text-sm text-slate-400">
            링크가 유효하지 않거나 만료되었습니다. 담당 강사님께 문의해주세요.
          </p>
        </div>
      </div>
    );
  }
}

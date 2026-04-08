import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { GapReportViewer } from "@/components/GapReportViewer";
import { FileText, Calendar, Users } from "lucide-react";
import { GapItem, ReportSummary } from "@/lib/schemas";
import { ReportSummaryCard } from "@/components/ReportSummaryCard";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!report) notFound();

  const summary = report.summary as ReportSummary | null;

  const { data: rawGaps } = await supabase
    .from("gap_items")
    .select("*")
    .eq("report_id", id)
    .order("chunk_index");

  const gaps: GapItem[] = (rawGaps ?? []).map((g) => ({
    id: g.id,
    chunkIndex: g.chunk_index,
    originalText: g.original_text,
    gapType: g.gap_type as GapItem["gapType"],
    severity: g.severity as GapItem["severity"],
    recommendation: g.recommendation,
    webEvidence: g.web_evidence ?? [],
    expectedQuestion: g.expected_question ?? undefined,
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* 헤더 */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-blue-50">
            <FileText className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{report.document_name}</h1>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(report.created_at).toLocaleDateString("ko-KR")}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {report.target_audience}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 점수 기반 리포트 영역 */}
      <div className="space-y-6">
        {summary && <ReportSummaryCard summary={summary} />}
        <GapReportViewer
          gaps={gaps}
          isAnalyzing={false}
          score={report.overall_score ?? 0}
        />
      </div>
    </div>
  );
}

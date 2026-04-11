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

  type GapRow = {
    id: string;
    chunk_index: number;
    original_text: string;
    gap_type: string;
    severity: string;
    recommendation: string;
    web_evidence: GapItem["webEvidence"] | null;
    expected_question: string | null;
    migrated_code?: string | null;
    cell_index?: number | null;
    page_number?: number | null;
    meta?: unknown;
  };

  const gaps: GapItem[] = (rawGaps ?? []).map((row: GapRow) => {
    const meta =
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as { cellIndex?: number; pageNumber?: number; fileType?: "ipynb" | "pdf" })
        : {};
    return {
      id: row.id,
      chunkIndex: row.chunk_index,
      originalText: row.original_text,
      gapType: row.gap_type as GapItem["gapType"],
      severity: row.severity as GapItem["severity"],
      recommendation: row.recommendation,
      webEvidence: row.web_evidence ?? [],
      expectedQuestion: row.expected_question ?? undefined,
      migratedCode: row.migrated_code ?? undefined,
      cellIndex: row.cell_index ?? meta.cellIndex,
      pageNumber: row.page_number ?? meta.pageNumber,
      fileType: meta.fileType,
    };
  });

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
          summary={summary}
        />
      </div>
    </div>
  );
}

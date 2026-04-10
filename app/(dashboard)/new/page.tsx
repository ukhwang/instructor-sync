"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePdfProcessor } from "@/hooks/usePdfProcessor";
import { useGapAnalysis } from "@/hooks/useGapAnalysis";
import { useAnalysisStore } from "@/store/analysisStore";
import { UploadZone } from "@/components/UploadZone";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { GapReportViewer } from "@/components/GapReportViewer";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/UpgradeModal";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Clock, CheckCircle2, Swords, MessageCircleWarning } from "lucide-react";

export default function NewAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [topic, setTopic] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { extractAndChunk, isProcessing } = usePdfProcessor();
  const { runAnalysis, retrySummary, downloadPatchedFile } = useGapAnalysis();
  const { 
    status, progress, gapItems, summary, setAnalysisStatus, resetAnalysis,
    summaryError, isRetryingSummary, summaryRetryCount 
  } = useAnalysisStore();

  const router = useRouter();
  const supabase = createClient();

  const isRunning = status === "parsing" || status === "analyzing";
  const isCompleted = status === "completed";

  const handleStart = async () => {
    if (!file) { toast.error("PDF 파일을 업로드하세요."); return; }
    if (!topic.trim()) { toast.error("강의 주제를 입력하세요."); return; }
    if (!targetAudience.trim()) { toast.error("대상 수강자를 입력하세요."); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("로그인이 필요합니다."); return; }

    // 크레딧 확인
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (!profile || profile.credits <= 0) {
      toast.error("분석 횟수가 모두 소진되었습니다. Pro 플랜으로 업그레이드하세요.");
      setShowUpgradeModal(true);
      return;
    }

    resetAnalysis();

    // 1. Supabase에 리포트 레코드 생성
    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        user_id: user.id,
        document_name: file.name,
        topic,
        target_audience: targetAudience,
        status: "analyzing",
      })
      .select()
      .single();

    if (error || !report) {
      toast.error("리포트 생성 실패");
      return;
    }
    setReportId(report.id);

    // 2. 크레딧 차감
    const { error: creditError } = await supabase
      .rpc('decrement_credit', { user_id: user.id });
    if (creditError) {
      toast.error("크레딧 차감 실패. 다시 시도해주세요.");
      return;
    }

    try {
      // 3. 백엔드 통합 분석 실행
      setAnalysisStatus("analyzing");
      await runAnalysis({ file, topic, targetAudience });

      // 4. 최종 리포트 업데이트
      const currentGapItems = useAnalysisStore.getState().gapItems;
      const score = Math.max(0, 100 - currentGapItems.length * 5);
      
      const { error: updateError } = await supabase
        .from("reports")
        .update({
          status: "completed",
          total_gaps: currentGapItems.length,
          overall_score: score,
          summary: useAnalysisStore.getState().summary,
        })
        .eq("id", report.id);

      if (updateError) console.error("Report update error:", updateError);

      // 5. gap_items 저장
      if (currentGapItems.length > 0) {
        await supabase.from("gap_items").insert(
          currentGapItems.map((g) => ({
            report_id: report.id,
            chunk_index: g.chunkIndex,
            original_text: g.originalText,
            gap_type: g.gapType,
            severity: g.severity,
            recommendation: g.recommendation,
            web_evidence: g.webEvidence,
            expected_question: g.expectedQuestion ?? null,
            meta: { cellIndex: g.cellIndex, pageNumber: g.pageNumber, fileType: g.fileType }
          }))
        );
      }

      toast.success("분석이 완료되었습니다!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.";
      toast.error(errorMessage);
      setAnalysisStatus("error");
      if (report?.id) {
        await supabase
          .from("reports")
          .update({ status: "error" })
          .eq("id", report.id);
      }
    }
  };

  const handleViewReport = () => {
    if (reportId) router.push(`/report/${reportId}`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">새 분석 시작</h1>
        <p className="text-muted-foreground text-sm mt-1">
          강의 교안을 업로드하면 AI가 지식 갭을 자동으로 분석합니다.
        </p>
      </div>

      {/* 입력 폼 */}
      {!isRunning && !isCompleted && (
        <div className="space-y-5">
          <UploadZone
            onFileSelect={setFile}
            selectedFile={file}
            onClear={() => setFile(null)}
            disabled={isRunning}
          />

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">강의 주제</label>
              <input
                type="text"
                placeholder="예: React 19 최신 기능 및 훅"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">대상 수강자</label>
              <input
                type="text"
                placeholder="예: 비전공 취준생, 현업 3년차 개발자"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleStart}
            disabled={isRunning || isProcessing}
          >
            {isRunning || isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            지식 갭 분석 시작
          </Button>
        </div>
      )}

      {/* 분석 중 */}
      {isRunning && <AnalysisProgress />}

      {/* 실시간 결과 (분석 중에도 표시) */}
      {(isRunning || isCompleted) && gapItems.length > 0 && (
        <GapReportViewer
          gaps={gapItems}
          isAnalyzing={isRunning}
          score={Math.max(0, 100 - gapItems.length * 5)}
          summary={summary}
          isSummaryError={summaryError}
          onRetrySummary={() => retrySummary({ topic, targetAudience })}
          isRetryingSummary={isRetryingSummary}
          summaryRetryCount={summaryRetryCount}
          onDownload={file ? () => downloadPatchedFile(file, gapItems) : undefined}
          fileType={file?.name.toLowerCase().endsWith(".pdf") ? "pdf" : "ipynb"}
        />
      )}

      {/* 갭 없음 — Defense Simulator Briefing */}
      {isCompleted && gapItems.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-6 space-y-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-1">
                Defense Simulator — All Clear
              </p>
              <h2 className="text-lg font-bold text-gray-900 leading-snug">
                {summary?.oneLiner ?? "교안 방어력 검증 완료. 내용 업데이트 항목 없음."}
              </h2>
            </div>
          </div>

          {summary?.prepTime && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium bg-emerald-100 rounded-lg px-3 py-2 w-fit">
              <Clock className="w-4 h-4" />
              권장 최종 점검 시간: {summary.prepTime}
            </div>
          )}

          {summary?.actionItems && summary.actionItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5" />
                수업 전 마지막 강화 미션
              </p>
              <div className="space-y-2">
                {summary.actionItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-white rounded-xl p-3.5 border border-emerald-100 shadow-sm"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {item.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{item.action}</p>
                      <p className="text-xs text-gray-400 mt-0.5">예상 소요: {item.estimatedMin}분</p>
                    </div>
                    <CheckCircle2 className="flex-shrink-0 w-4 h-4 text-emerald-400 mt-0.5" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary?.defenseDrills && summary.defenseDrills.length > 0 && (
            <div className="space-y-3 pt-1 border-t border-emerald-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircleWarning className="w-3.5 h-3.5" />
                돌발 질문 디펜스 — 시니어 시험관 시뮬
              </p>
              <div className="space-y-3">
                {summary.defenseDrills.map((drill, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-white/90 p-4 space-y-2.5 shadow-sm"
                  >
                    <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                      비유 · 프레이밍
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">{drill.metaphor}</p>
                    <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide pt-1">
                      압박 질문
                    </p>
                    <p className="text-sm text-slate-900 font-medium leading-snug">{drill.pressureQuestion}</p>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide pt-1">
                      권장 답변 뼈대
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">{drill.talkTrack}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 완료 버튼 */}
      {isCompleted && (
        <Button className="w-full" onClick={handleViewReport}>
          전체 리포트 보기 →
        </Button>
      )}

      {/* 업그레이드 모달 */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </div>
  );
}

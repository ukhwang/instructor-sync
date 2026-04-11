"use client";

import { useState } from "react";
import { GapItem, isLectureGuidePopulated, LectureGuide, ReportSummary } from "@/lib/schemas";
import { LectureGuideCard } from "./LectureGuideCard";
import { ReportSummaryCard } from "./ReportSummaryCard";
import { GapBadge } from "./GapBadge";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ScoreGauge } from "./ScoreGauge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Download } from "lucide-react";
import { Button } from "./ui/button";

interface GapReportViewerProps {
  gaps: GapItem[];
  isAnalyzing: boolean;
  score: number;
  summary?: ReportSummary | null;
  isSummaryError?: boolean;
  onRetrySummary?: () => void;
  isRetryingSummary?: boolean;
  summaryRetryCount?: number;
  onDownload?: () => void;
  fileType?: "ipynb" | "pdf";
  lectureGuide?: LectureGuide | null;
}

type SeverityFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";

export function GapReportViewer({ gaps, isAnalyzing, score, summary, isSummaryError, onRetrySummary, isRetryingSummary, summaryRetryCount = 0, onDownload, fileType, lectureGuide = null }: GapReportViewerProps) {
  const [selectedGap, setSelectedGap] = useState<GapItem | null>(null);
  const [filter, setFilter] = useState<SeverityFilter>("HIGH");

  const filtered = filter === "ALL" ? gaps : gaps.filter((g) => g.severity === filter);

  const counts = {
    HIGH:   gaps.filter((g) => g.severity === "HIGH").length,
    MEDIUM: gaps.filter((g) => g.severity === "MEDIUM").length,
    LOW:    gaps.filter((g) => g.severity === "LOW").length,
  };

  return (
    <div className="space-y-6">
      {(summary || isAnalyzing || isSummaryError || isRetryingSummary) ? (
        <ReportSummaryCard 
          summary={summary} 
          isLoading={(isAnalyzing || !!isRetryingSummary) && !summary && !isSummaryError} 
          isError={isSummaryError && !isRetryingSummary} 
          onRetry={onRetrySummary} 
          isRetryDisabled={summaryRetryCount >= 3}
        />
      ) : null}
      {/* 점수 게이지 및 다운로드 */}
      <div className="flex items-center justify-between gap-4">
        <ScoreGauge score={score} totalGaps={gaps.length} />
        {onDownload && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onDownload}
            disabled={fileType === "pdf"}
            className="rounded-xl border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 font-bold gap-2 transition-all duration-300 disabled:opacity-100 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
            title={fileType === "pdf" ? "PDF는 원문 구조 특성상 패치 파일 내보내기를 지원하지 않습니다." : undefined}
          >
            <Download className="w-4 h-4" />
            {fileType === "pdf" ? "수정본 다운로드 불가 (PDF)" : "패치된 파일 다운로드 (.ipynb)"}
          </Button>
        )}
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">심각도 필터:</span>
        {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent border-border"
            }`}
          >
            {s === "ALL" ? `전체 (${gaps.length})` : `${s} (${counts[s]})`}
          </button>
        ))}
      </div>

      {/* 갭 리스트 */}
      <div className="space-y-3">
        {isAnalyzing && gaps.length === 0 && !isLectureGuidePopulated(lectureGuide) && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl motion-safe:transition-opacity motion-safe:duration-500" />
            ))}
          </div>
        )}

        {filtered.map((gap) => (
          <button
            key={gap.id}
            onClick={() => setSelectedGap(gap)}
            className="w-full text-left rounded-xl border bg-card p-4 hover:shadow-md hover:border-primary/50 transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <GapBadge gapType={gap.gapType} severity={gap.severity} />
                  <span className="text-[10px] font-mono text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
                    {gap.pageNumber ? `PAGE ${gap.pageNumber}` : `CELL ${gap.cellIndex ?? gap.chunkIndex}`}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-700 line-clamp-1">
                  "{gap.originalText}"
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {gap.recommendation}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
            </div>
          </button>
        ))}

        {!isAnalyzing && filtered.length === 0 && gaps.length > 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            선택한 심각도의 갭이 없습니다.
          </div>
        )}

        {!isAnalyzing && gaps.length === 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-8 text-center space-y-2">
            <p className="font-semibold text-slate-900">자동 분석에서 지식 갭이 탐지되지 않았습니다.</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {isLectureGuidePopulated(lectureGuide) ? (
                <>
                  아래 <span className="font-medium text-slate-700">AI 교수용 가이드</span>에서 강조점·비유·예상 질문·실습 아이디어를
                  확인해 보세요.
                </>
              ) : (
                <>
                  돌발 질문·비유 코칭은 상단 <span className="font-medium text-slate-700">AI 코치 요약</span>에 동적으로 생성된 내용이
                  있으면 함께 표시됩니다.
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {isLectureGuidePopulated(lectureGuide) && lectureGuide ? (
        <LectureGuideCard guide={lectureGuide} />
      ) : null}

      <EvidenceDrawer
        gap={selectedGap}
        open={!!selectedGap}
        onClose={() => setSelectedGap(null)}
      />
    </div>
  );
}

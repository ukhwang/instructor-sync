"use client";

import { useState } from "react";
import { GapItem, ReportSummary } from "@/lib/schemas";
import { ReportSummaryCard } from "./ReportSummaryCard";
import { GapBadge } from "./GapBadge";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ScoreGauge } from "./ScoreGauge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

interface GapReportViewerProps {
  gaps: GapItem[];
  isAnalyzing: boolean;
  score: number;
  summary?: ReportSummary | null;
  isSummaryError?: boolean;
  onRetrySummary?: () => void;
  isRetryingSummary?: boolean;
  summaryRetryCount?: number;
}

type SeverityFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";

export function GapReportViewer({ gaps, isAnalyzing, score, summary, isSummaryError, onRetrySummary, isRetryingSummary, summaryRetryCount = 0 }: GapReportViewerProps) {
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
      {/* 점수 게이지 */}
      <ScoreGauge score={score} totalGaps={gaps.length} />

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
        {isAnalyzing && gaps.length === 0 && (
          <>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </>
        )}

        {filtered.map((gap) => (
          <button
            key={gap.id}
            onClick={() => setSelectedGap(gap)}
            className="w-full text-left rounded-xl border bg-card p-4 hover:shadow-md hover:border-primary/50 transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1 min-w-0">
                <GapBadge gapType={gap.gapType} severity={gap.severity} />
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
      </div>

      <EvidenceDrawer
        gap={selectedGap}
        open={!!selectedGap}
        onClose={() => setSelectedGap(null)}
      />
    </div>
  );
}

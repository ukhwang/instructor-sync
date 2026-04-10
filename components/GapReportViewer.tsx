"use client";

import { useState } from "react";
import { GapItem, ReportSummary } from "@/lib/schemas";
import { ReportSummaryCard } from "./ReportSummaryCard";
import { GapBadge } from "./GapBadge";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ScoreGauge } from "./ScoreGauge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

const COACH_MOCK_DATA = {
  question: {
    title: "🔥 돌발 질문 시뮬레이터 (현업 3년차 프론트엔드 개발자)",
    content: "Q: 강사님, 교안의 [...original].sort()는 구식 아닌가요? 최신 프로젝트에선 메모리 오버헤드 문제로 ES2023의 toSorted()를 표준으로 쓰는데 왜 전개 연산자를 가르치시죠?",
    defense: "A (방어 전략): '현업 트렌드를 정확히 짚으셨네요. 다만, 본 교안은 구형 사내망 지원이 필요한 B2B 환경을 가정해 호환성이 높은 Spread 방식을 기본기로 배치했습니다. 하지만 최신 환경에선 toSorted()가 정답이니 오늘 추가 세션으로 다루겠습니다.'"
  },
  analogy: {
    title: "💡 마케터/기획자 맞춤형 비유 (Tool Use 원리)",
    content: "능력 있는 신입 비서를 채용했다고 상상해보세요. 이 비서는 똑똑하지만 '창문 없는 방'에 갇혀 외부 정보를 모릅니다. 그래서 비서에게 '기상청 단말기(API)'를 쥐여주는 것이 도구 사용(Tool-Use)입니다.",
    defense: "비유 포인트: 비서가 직접 단말기 정보를 뽑아온 뒤, 자신의 두뇌로 분석해서 '내일 행사는 비가 오니 취소하시죠'라고 보고하는 과정으로 설명하세요."
  }
};

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
}

type SeverityFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";

export function GapReportViewer({ gaps, isAnalyzing, score, summary, isSummaryError, onRetrySummary, isRetryingSummary, summaryRetryCount = 0, onDownload, fileType }: GapReportViewerProps) {
  const [selectedGap, setSelectedGap] = useState<GapItem | null>(null);
  const [filter, setFilter] = useState<SeverityFilter>("HIGH");
  const [isMockLoading, setIsMockLoading] = useState(false);
  const [activeBonus, setActiveBonus] = useState<'question' | 'analogy' | null>(null);

  const handleBonusClick = (type: 'question' | 'analogy') => {
    setIsMockLoading(true);
    setActiveBonus(null);
    setTimeout(() => {
      setActiveBonus(type);
      setIsMockLoading(false);
    }, 2000);
  };

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
        {isAnalyzing && gaps.length === 0 && (
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
          <div className="space-y-6">
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/50">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center border-4 border-white shadow-sm">
                <span className="text-3xl">✨</span>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-900 text-lg">모든 정보가 완벽합니다!</p>
                <p className="text-sm text-slate-500 max-w-[320px] mx-auto leading-relaxed">
                  현재 교안에서 IT 트렌드와 일치하지 않는 지식 갭이 단 하나도 발견되지 않았습니다. 안심하고 수업을 진행하세요.
                </p>
              </div>

              {/* 프리미엄 버튼 세트 */}
              <div className="flex gap-3 w-full max-w-[420px] pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleBonusClick('question')}
                  disabled={isMockLoading}
                  className="flex-1 rounded-xl border-blue-200 bg-white hover:bg-blue-50 text-blue-700 font-bold gap-2"
                >
                  돌발 질문 대비하기
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleBonusClick('analogy')}
                  disabled={isMockLoading}
                  className="flex-1 rounded-xl border-purple-200 bg-white hover:bg-purple-50 text-purple-700 font-bold gap-2"
                >
                  수강생 맞춤형 비유
                </Button>
              </div>
            </div>

            {/* 로딩 상태 표시 */}
            {isMockLoading && (
              <div className="flex flex-col items-center justify-center p-12 space-y-4 bg-slate-50/30 rounded-xl border border-dashed border-slate-200 animate-in fade-in duration-500 motion-safe:transition-all motion-safe:duration-500">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm font-medium text-slate-600">AI 코치가 교안의 논리적 맹점을 파악 중입니다...</p>
              </div>
            )}

            {/* 결과 카드 */}
            {!isMockLoading && activeBonus && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300 border-l-4 border-l-blue-500 animate-in slide-in-from-bottom-4 fade-in duration-500">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-slate-800">{COACH_MOCK_DATA[activeBonus].title}</h4>
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100">AI COMPLEMENT</Badge>
                </div>
                <div className="space-y-3">
                  <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap">
                    {COACH_MOCK_DATA[activeBonus].content}
                  </div>
                  <div className="text-xs text-blue-700 font-medium bg-blue-50 p-4 rounded-lg border border-blue-100 leading-relaxed">
                    💡 {COACH_MOCK_DATA[activeBonus].defense}
                  </div>
                </div>
              </div>
            )}
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

"use client";

import { ReportSummary } from "@/lib/schemas";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ReportSummaryCardProps {
  summary?: ReportSummary | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isRetryDisabled?: boolean;
}

export function ReportSummaryCard({ summary, isLoading, isError, onRetry, isRetryDisabled }: ReportSummaryCardProps) {

  if (isError) {
    return (
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6 flex flex-col items-center justify-center space-y-3 min-h-[150px]">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm font-medium text-red-700">리포트 요약을 불러오는 데 실패했습니다.</p>
        {onRetry && (
          <div className="flex flex-col items-center gap-2 mt-2">
            <button 
              onClick={onRetry} 
              disabled={isRetryDisabled}
              className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              재시도 (Retry)
            </button>
            {isRetryDisabled && (
              <p className="text-xs font-semibold text-red-600">
                최대 재시도 횟수를 초과했습니다. 잠시 후 시도해 주세요.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6 space-y-4">
      <div id="ai-summary-debug" className="hidden">{JSON.stringify(summary)}</div>
      
      {/* AI 한줄 요약 */}
      {summary?.oneLiner ? (
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-600 shrink-0">
            <AlertCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
              AI 코치 요약
            </p>
            <p className="text-sm leading-relaxed font-medium text-slate-800">
              {summary.oneLiner}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-green-500 shrink-0">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">
              AI 코치 요약 (변경 사항 없음)
            </p>
            <p className="text-sm leading-relaxed font-medium text-slate-800">
              현재 교안은 최신 트렌드를 완벽하게 반영하고 있습니다. 내용 검증에 소모될 시간을 아껴, 수강생의 몰입을 이끌어낼 '전달 방식'과 '심화 질문 대비'에 집중하시기 바랍니다.
            </p>
          </div>
        </div>
      )}

      {/* 예상 준비시간 */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-blue-200 w-fit">
        <Clock className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-slate-700">
          예상 준비 시간:
        </span>
        <span className="text-sm font-bold text-blue-600">
          {summary?.prepTime || "0분 (추가 검증 없음)"}
        </span>
      </div>

      {/* 우선순위 행동 목록 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          지금 바로 할 것
        </p>
        {!summary?.actionItems || summary.actionItems.length === 0 ? (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-white border border-blue-100">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-sm font-medium text-slate-600">
              현재 발견된 우선순위 행동(Action Item)이 없습니다.
            </p>
          </div>
        ) : (
          summary.actionItems.map((item) => (
            <div
              key={item.priority}
              className="flex items-start gap-3 p-3 rounded-lg bg-white border border-blue-100"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0 mt-0.5">
                {item.priority}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700">{item.action}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {item.estimatedMin}분
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 강의 핵심 포인트 섹션 (개수가 0개면 완전 Null 반환) */}
      {summary?.teachingPoints && summary.teachingPoints.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            강의 핵심 포인트
          </p>
          {summary.teachingPoints.map((tp, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-white border border-blue-100 space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                {idx + 1}. {tp.point}
              </p>
              <p className="text-xs text-blue-600">{tp.why}</p>
              <p className="text-xs text-slate-500 italic">
                💡 {tp.tip}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

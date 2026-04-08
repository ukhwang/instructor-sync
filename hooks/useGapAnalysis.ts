"use client";

import { useCallback } from "react";
import { useAnalysisStore } from "@/store/analysisStore";
import { AnalyzeChunkInput, AnalyzeChunkOutput, ReportSummarySchema } from "@/lib/schemas";

const CONCURRENT_BATCH_SIZE = 2; // 동시에 처리할 청크 수 (타임아웃 안전 마진)

interface UseGapAnalysisReturn {
  runAnalysis: (params: {
    chunks: string[];
    topic: string;
    targetAudience: string;
  }) => Promise<void>;
  retrySummary: (params: {
    topic: string;
    targetAudience: string;
  }) => Promise<void>;
}

export function useGapAnalysis(): UseGapAnalysisReturn {
  const { 
    addGapItems, setAnalysisProgress, setAnalysisStatus, setSummary, setSummaryError,
    summaryRetryCount, incrementSummaryRetryCount, setIsRetryingSummary
  } = useAnalysisStore();

  const analyzeChunk = async (
    payload: AnalyzeChunkInput
  ): Promise<AnalyzeChunkOutput> => {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // 개별 청크 실패는 전체를 중단하지 않음 — allSettled 전략
      throw new Error(`청크 ${payload.chunkIndex} 분석 실패: ${res.status}`);
    }

    return res.json() as Promise<AnalyzeChunkOutput>;
  };

  const runAnalysis = useCallback(
    async ({
      chunks,
      topic,
      targetAudience,
    }: {
      chunks: string[];
      topic: string;
      targetAudience: string;
    }) => {
      setAnalysisStatus("analyzing");
      const total = chunks.length;

      // CONCURRENT_BATCH_SIZE 단위로 슬라이싱하여 병렬 처리
      for (let i = 0; i < total; i += CONCURRENT_BATCH_SIZE) {
        const batch = chunks.slice(i, i + CONCURRENT_BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map((chunkText, batchIdx) =>
            analyzeChunk({
              chunkText,
              chunkIndex: i + batchIdx,
              topic,
              targetAudience,
            })
          )
        );

        results.forEach((result) => {
          if (result.status === "fulfilled" && result.value.hasGaps) {
            // 성공한 청크 결과만 즉시 Zustand에 병합 → UI 실시간 업데이트
            addGapItems(result.value.gaps);
          }
          // 실패한 청크는 조용히 스킵 (UX 방해 없음)
        });

        // 진행률 업데이트
        const processed = Math.min(i + CONCURRENT_BATCH_SIZE, total);
        setAnalysisProgress(Math.round((processed / total) * 100));
      }

      // 분석 완료 후 요약 호출 (단일 진실 공급원 - API 사용)
      try {
        setSummaryError(false);
        const currentGaps = useAnalysisStore.getState().gapItems;
        const summaryRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            targetAudience,
            gaps: currentGaps,
          }),
        });

        if (!summaryRes.ok) {
          throw new Error(`Summary API failed with status ${summaryRes.status}`);
        }

        const rawData = await summaryRes.json();
        const parsed = ReportSummarySchema.safeParse(rawData); // 런타임 방어선

        if (!parsed.success) {
          console.error("[Sentry 추적용 로그] 요약 파싱 검증 실패:", parsed.error, "응답 데이터:", rawData);
          setSummaryError(true);
        } else {
          setSummary(parsed.data);
        }
      } catch (err) {
        console.error("[Sentry 추적용 로그] 요약 생성 실패 (네트워크 또는 서버):", err);
        setSummaryError(true);
      }

      setAnalysisStatus("completed");
    },
    [addGapItems, setAnalysisProgress, setAnalysisStatus, setSummary, setSummaryError]
  );

  const retrySummary = useCallback(
    async ({ topic, targetAudience }: { topic: string; targetAudience: string }) => {
      if (summaryRetryCount >= 3) return;

      try {
        // 낙관적 UI(Optimistic UI) 업데이트: 에러 메시지를 지우고 스켈레톤 로더로 원복
        setSummaryError(false);
        setIsRetryingSummary(true);
        incrementSummaryRetryCount();

        const currentGaps = useAnalysisStore.getState().gapItems;
        const summaryRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            targetAudience,
            gaps: currentGaps,
          }),
        });

        if (!summaryRes.ok) {
          throw new Error(`Summary API failed with status ${summaryRes.status}`);
        }

        const rawData = await summaryRes.json();
        const parsed = ReportSummarySchema.safeParse(rawData);

        if (!parsed.success) {
          console.error("[Sentry 추적용 로그] 요약 재시도 파싱 실패:", parsed.error, rawData);
          setSummaryError(true);
        } else {
          setSummary(parsed.data);
        }
      } catch (err) {
        console.error("[Sentry 추적용 로그] 요약 재시도 실패:", err);
        setSummaryError(true);
      } finally {
        setIsRetryingSummary(false);
      }
    },
    [setSummary, setSummaryError, summaryRetryCount, incrementSummaryRetryCount, setIsRetryingSummary]
  );

  return { runAnalysis, retrySummary };
}
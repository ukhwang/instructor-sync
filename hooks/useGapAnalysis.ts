"use client";

import { useCallback } from "react";
import { useAnalysisStore } from "@/store/analysisStore";
import { ReportSummarySchema, GapItem } from "@/lib/schemas";
import {
  ANALYZE_FETCH_TIMEOUT_MS,
  mapAnalyzeHttpStatus,
  mapAnalyzeNetworkError,
  parseFastAPIErrorDetail,
  parseFastAPIErrorDetailFromText,
} from "@/lib/analysisErrors";

interface UseGapAnalysisReturn {
  runAnalysis: (params: {
    file: File;
    topic: string;
    targetAudience: string;
  }) => Promise<void>;
  retrySummary: (params: {
    topic: string;
    targetAudience: string;
  }) => Promise<void>;
  downloadPatchedFile: (originalFile: File, gaps: GapItem[]) => Promise<void>;
}

export function useGapAnalysis(): UseGapAnalysisReturn {
  const { 
    addGapItems, setAnalysisProgress, setAnalysisStatus, setSummary, setSummaryError,
    summaryRetryCount, incrementSummaryRetryCount, setIsRetryingSummary
  } = useAnalysisStore();

  const runAnalysis = useCallback(
    async ({
      file,
      topic,
      targetAudience,
    }: {
      file: File;
      topic: string;
      targetAudience: string;
    }) => {
      setAnalysisStatus("analyzing");
      setAnalysisProgress(10); // 시작점

      const formData = new FormData();
      formData.append("file", file);
      formData.append("topic", topic);
      formData.append("targetAudience", targetAudience);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), ANALYZE_FETCH_TIMEOUT_MS);

      try {
        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
        let res: Response;
        try {
          res = await fetch(`${baseUrl}/api/analyze`, {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });
        } catch (e) {
          throw new Error(mapAnalyzeNetworkError(e));
        } finally {
          window.clearTimeout(timeoutId);
        }

        const rawText = await res.text();
        let data: Record<string, unknown>;
        try {
          data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          throw new Error(
            "분석 응답을 해석할 수 없습니다. 서버가 일시적으로 불안정할 수 있으니 잠시 후 다시 시도해 주세요."
          );
        }

        if (!res.ok) {
          const detail = parseFastAPIErrorDetailFromText(rawText);
          throw new Error(detail || mapAnalyzeHttpStatus(res.status));
        }

        if (!Array.isArray(data.gaps)) {
          throw new Error(
            "분석 결과 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요."
          );
        }
        if (typeof data.errorMessage === "string" && data.errorMessage.trim()) {
          throw new Error(data.errorMessage);
        }

        setAnalysisProgress(80);

        if (data.gaps.length > 0) {
          const st = data.sourceType === "pdf" || data.sourceType === "ipynb" ? data.sourceType : undefined;
          const gapsWithContext = (data.gaps as GapItem[]).map((g) => ({
            ...g,
            fileType: st ?? g.fileType,
          }));
          addGapItems(gapsWithContext);
        }

        // 분석 완료 후 요약 호출
        try {
          setSummaryError(false);
          const summaryRes = await fetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic,
              targetAudience,
              gaps: data.gaps as GapItem[],
            }),
          });

          if (summaryRes.ok) {
            const rawData = await summaryRes.json();
            const parsed = ReportSummarySchema.safeParse(rawData);
            if (parsed.success) setSummary(parsed.data);
          }
        } catch (err) {
          setSummaryError(true);
        }

        setAnalysisProgress(100);
        setAnalysisStatus("completed");
      } catch (err) {
        setAnalysisStatus("error");
        const message =
          err instanceof Error ? err.message : "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
        throw new Error(message);
      }
    },
    [addGapItems, setAnalysisProgress, setAnalysisStatus, setSummary, setSummaryError]
  );

  const retrySummary = useCallback(
    async ({ topic, targetAudience }: { topic: string; targetAudience: string }) => {
      if (summaryRetryCount >= 3) return;
      try {
        setSummaryError(false);
        setIsRetryingSummary(true);
        incrementSummaryRetryCount();

        const currentGaps = useAnalysisStore.getState().gapItems;
        const summaryRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, targetAudience, gaps: currentGaps }),
        });

        if (summaryRes.ok) {
          const rawData = await summaryRes.json();
          const parsed = ReportSummarySchema.safeParse(rawData);
          if (parsed.success) setSummary(parsed.data);
          else setSummaryError(true);
        }
      } catch {
        setSummaryError(true);
      } finally {
        setIsRetryingSummary(false);
      }
    },
    [setSummary, setSummaryError, summaryRetryCount, incrementSummaryRetryCount, setIsRetryingSummary]
  );

  const downloadPatchedFile = useCallback(
    async (originalFile: File, gaps: GapItem[]) => {
      if (originalFile.name.toLowerCase().endsWith(".pdf")) {
        alert("PDF 파일은 수정본 다운로드를 지원하지 않습니다.");
        return;
      }

      const formData = new FormData();
      formData.append("file", originalFile);
      
      const patchData = gaps
        .filter(g => g.migratedCode && g.cellIndex !== undefined)
        .map(g => ({ cell_index: g.cellIndex, migrated_code: g.migratedCode }));
        
      formData.append("gap_items_json", JSON.stringify(patchData));

      let res: Response;
      try {
        res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/api/export`, {
          method: "POST",
          body: formData,
        });
      } catch (e) {
        throw new Error(mapAnalyzeNetworkError(e));
      }

      if (!res.ok) {
        const detail = await parseFastAPIErrorDetail(res);
        throw new Error(detail || mapAnalyzeHttpStatus(res.status));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `patched_${originalFile.name}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
    []
  );

  return { runAnalysis, retrySummary, downloadPatchedFile };
}
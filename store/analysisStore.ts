import { create } from "zustand";
import { GapItem, ReportSummary } from "@/lib/schemas";

type AnalysisStatus = "idle" | "parsing" | "analyzing" | "completed" | "error";

interface AnalysisState {
    status: AnalysisStatus;
    progress: number; // 0~100
    gapItems: GapItem[];
    summary: ReportSummary | null;
    summaryError: boolean;
    isRetryingSummary: boolean;
    summaryRetryCount: number;
    // Actions
    setAnalysisStatus: (status: AnalysisStatus) => void;
    setAnalysisProgress: (progress: number) => void;
    addGapItems: (items: GapItem[]) => void;
    setSummary: (summary: ReportSummary) => void;
    setSummaryError: (hasError: boolean) => void;
    setIsRetryingSummary: (isRetrying: boolean) => void;
    incrementSummaryRetryCount: () => void;
    resetAnalysis: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
    status: "idle",
    progress: 0,
    gapItems: [],
    summary: null,
    summaryError: false,
    isRetryingSummary: false,
    summaryRetryCount: 0,

    setAnalysisStatus: (status) => set({ status }),

    setAnalysisProgress: (progress) => set({ progress }),

    setSummary: (summary) => set({ summary }),

    setSummaryError: (hasError) => set({ summaryError: hasError }),
    setIsRetryingSummary: (isRetrying) => set({ isRetryingSummary: isRetrying }),
    incrementSummaryRetryCount: () => set((state) => ({ summaryRetryCount: state.summaryRetryCount + 1 })),

    addGapItems: (items) =>
        set((state) => ({
            // 중복 ID 방어: 기존 갭과 병합
            gapItems: [
                ...state.gapItems,
                ...items.filter(
                    (newItem) => !state.gapItems.some((g) => g.id === newItem.id)
                ),
            ],
        })),

    resetAnalysis: () => set({ 
      status: "idle", 
      progress: 0, 
      gapItems: [], 
      summary: null, 
      summaryError: false,
      isRetryingSummary: false,
      summaryRetryCount: 0
    }),
}));
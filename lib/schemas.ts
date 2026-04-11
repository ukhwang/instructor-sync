import { z } from "zod";

export const AnalyzeChunkInputSchema = z.object({
  chunkText: z.string(),
  chunkIndex: z.number(),
  topic: z.string(),
  targetAudience: z.string(),
});

export type AnalyzeChunkInput = z.infer<typeof AnalyzeChunkInputSchema>;

export const ReportSummarySchema = z.object({
  oneLiner: z.string(),
  prepTime: z.string(),
  actionItems: z.array(z.object({
    priority: z.number(),
    action: z.string(),
    estimatedMin: z.number(),
  })),
  teachingPoints: z.array(z.object({
    point: z.string(),
    why: z.string(),
    tip: z.string(),
  })).optional(),
  /** 갭 0개 시 ‘돌발 질문 디펜스’ 시뮬레이션용 (선택) */
  defenseDrills: z.array(z.object({
    metaphor: z.string(),
    pressureQuestion: z.string(),
    talkTrack: z.string(),
  })).optional(),
});

export type ReportSummary = z.infer<typeof ReportSummarySchema>;

/** 백엔드·Supabase `lecture_guide` JSON과 동일 스키마 (quickLab 권장) */
export const LectureGuideSchema = z
  .object({
    emphasis: z.array(z.string()).optional(),
    analogies: z.array(z.string()).optional(),
    faq: z.array(z.string()).optional(),
    quickLab: z.array(z.string()).optional(),
    quick_lab: z.array(z.string()).optional(),
  })
  .passthrough();

export type LectureGuide = {
  emphasis: string[];
  analogies: string[];
  faq: string[];
  quickLab: string[];
};

export function parseLectureGuide(raw: unknown): LectureGuide | null {
  const r = LectureGuideSchema.safeParse(raw);
  if (!r.success) return null;
  const d = r.data;
  const quickLab = d.quickLab ?? d.quick_lab ?? [];
  const out: LectureGuide = {
    emphasis: d.emphasis ?? [],
    analogies: d.analogies ?? [],
    faq: d.faq ?? [],
    quickLab: Array.isArray(quickLab) ? quickLab : [],
  };
  return isLectureGuidePopulated(out) ? out : null;
}

export function isLectureGuidePopulated(g: LectureGuide | null | undefined): boolean {
  if (!g) return false;
  const n = (a: string[]) => a.filter((s) => s.trim().length > 0).length;
  return n(g.emphasis) + n(g.analogies) + n(g.faq) + n(g.quickLab) > 0;
}

export interface WebEvidence {
  title: string;
  url: string;
  snippet: string;
}

export interface GapItem {
  id: string;
  chunkIndex: number;
  cellIndex?: number;
  pageNumber?: number; // PDF 페이지 번호
  fileType?: "ipynb" | "pdf";
  originalText: string;
  migratedCode?: string;
  gapType: "OUTDATED" | "MISSING" | "VERIFY";
  severity: "HIGH" | "MEDIUM" | "LOW";
  recommendation: string;
  webEvidence: WebEvidence[];
  expectedQuestion?: string;
}

export interface AnalyzeChunkOutput {
  chunkIndex: number;
  gaps: GapItem[];
  hasGaps: boolean;
}

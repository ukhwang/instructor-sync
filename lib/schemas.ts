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
});

export type ReportSummary = z.infer<typeof ReportSummarySchema>;
export interface WebEvidence {
  title: string;
  url: string;
  snippet: string;
}

export interface GapItem {
  id: string;
  chunkIndex: number;
  originalText: string;
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

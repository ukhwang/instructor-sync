"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GapItem } from "@/lib/schemas";
import { GapBadge } from "./GapBadge";
import { ExternalLink } from "lucide-react";
import { KnowledgeGapReport } from "./KnowledgeGapReport";

interface EvidenceDrawerProps {
  gap: GapItem | null;
  open: boolean;
  onClose: () => void;
}

export function EvidenceDrawer({ gap, open, onClose }: EvidenceDrawerProps) {
  if (!gap) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[540px] overflow-y-auto">
        <SheetHeader className="space-y-3">
          <SheetTitle>갭 상세 분석</SheetTitle>
          <GapBadge gapType={gap.gapType} severity={gap.severity} />
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* 원문 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              교안 원문
            </p>
            <blockquote className="border-l-4 border-slate-300 pl-4 text-sm text-slate-600 italic">
              "{gap.originalText}"
            </blockquote>
          </div>

          {/* 권고사항 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              업데이트 권고
            </p>
            <p className="text-sm leading-relaxed">{gap.recommendation}</p>
          </div>

          {/* 코드 마이그레이션 제안 */}
          {gap.migratedCode && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                코드 마이그레이션 제안
              </p>
              <KnowledgeGapReport 
                original={gap.originalText} 
                migrated={gap.migratedCode} 
              />
            </div>
          )}

          {/* 수강생 예상 질문 (USP) */}
          {gap.expectedQuestion && (
            <div className="rounded-xl border-2 border-orange-100 bg-orange-50 p-4">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                <span>⚠️</span> 브레이커용 돌발 질문 (예상)
              </p>
              <p className="text-sm font-semibold text-slate-800 leading-relaxed italic">
                "{gap.expectedQuestion}"
              </p>
            </div>
          )}

          {/* 웹 근거 */}
          {gap.webEvidence.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                최신 웹 근거
              </p>
              <div className="space-y-3">
                {gap.webEvidence.map((ev, idx) => (
                  <a
                    key={idx}
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border p-3 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2">{ev.title}</p>
                      <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3">
                      {ev.snippet}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

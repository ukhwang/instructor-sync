"use client";

import { motion } from "motion/react";
import { Check, Loader2, MessageCircle, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";

import { shareToKakao, vibrate, type ShareResult } from "@/lib/kakao-share";
import { PAIN_AREAS, type Homework, type HomeworkLog, type Member, type PainArea } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────
 * 1. Props
 * ──────────────────────────────────────────────────────────── */

export interface MilestoneReportCardProps {
  member: Member;
  /** 리포트 기간 내 배정된 숙제 */
  homeworks: Homework[];
  /** 리포트 기간 내 회원 기록 */
  logs: HomeworkLog[];
  /** Edge Function(WEEKLY_SUMMARY / NEXT_SESSION_BRIEF)이 생성하고 강사가 승인한 요약 */
  aiSummary: string;
  reportToken: string;
  studioName: string;
  /** 기본값: member.ptSessionCount */
  sessionNumber?: number;
  /** 미지정 시 기록상 가장 빈번한 통증 부위 */
  focusPainArea?: PainArea;
  /** 공유 버튼 숨김 (회원용 /report/[token] 공개 페이지) */
  hideShareButton?: boolean;
  onShared?: (result: ShareResult) => void;
}

/* ────────────────────────────────────────────────────────────
 * 2. Derivation Hook (순수 계산 — 서버 데이터를 가공만 함)
 * ──────────────────────────────────────────────────────────── */

interface PainPoint {
  at: string;
  score: number;
}

interface MilestoneMetrics {
  assignedCount: number;
  achievedCount: number;
  complianceRate: number;
  painArea: PainArea | null;
  painPoints: PainPoint[];
  painStart: number | null;
  painEnd: number | null;
  periodLabel: string | null;
}

const MAX_CHART_POINTS = 10;
const SEOUL_DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return SEOUL_DATE.format(date).replace(/\s/g, "").replace(/\.$/, "");
}

function downsample<T>(values: T[], max: number): T[] {
  if (values.length <= max) return values;
  const result: T[] = [];
  for (let i = 0; i < max; i += 1) {
    const idx = Math.round((i * (values.length - 1)) / (max - 1));
    const value = values[idx];
    if (value !== undefined) result.push(value);
  }
  return result;
}

function dominantPainArea(logs: HomeworkLog[]): PainArea | null {
  const counts = new Map<PainArea, number>();
  for (const log of logs) {
    for (const area of log.painAreas) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  let best: PainArea | null = null;
  let bestCount = 0;
  for (const area of PAIN_AREAS) {
    const count = counts.get(area) ?? 0;
    if (count > bestCount) {
      best = area;
      bestCount = count;
    }
  }
  return best;
}

export function useMilestoneMetrics(
  homeworks: Homework[],
  logs: HomeworkLog[],
  focusPainArea?: PainArea,
): MilestoneMetrics {
  return useMemo<MilestoneMetrics>(() => {
    const assignedCount = homeworks.length;
    const homeworkIds = new Set(homeworks.map((h) => h.id));

    const achieved = new Set<string>();
    for (const homework of homeworks) {
      if (homework.status === "completed") achieved.add(homework.id);
    }
    for (const log of logs) {
      if (homeworkIds.has(log.homeworkId) && log.totalSets > 0 && log.completedSets >= log.totalSets) {
        achieved.add(log.homeworkId);
      }
    }
    const achievedCount = achieved.size;
    const complianceRate = assignedCount > 0 ? Math.round((achievedCount / assignedCount) * 100) : 0;

    const painArea = focusPainArea ?? dominantPainArea(logs);
    const scored = logs
      .filter((log): log is HomeworkLog & { painScore: number } => log.painScore !== null)
      .filter((log) => (painArea ? log.painAreas.includes(painArea) || log.painAreas.length === 0 : true))
      .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime())
      .map<PainPoint>((log) => ({ at: log.loggedAt, score: Math.min(10, Math.max(0, log.painScore)) }));

    const painPoints = downsample(scored, MAX_CHART_POINTS);
    const first = painPoints[0];
    const last = painPoints[painPoints.length - 1];

    const assignedTimes = homeworks
      .map((h) => new Date(h.assignedAt).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);
    const periodStart = assignedTimes[0];
    const periodEnd = assignedTimes[assignedTimes.length - 1];
    const periodLabel =
      periodStart !== undefined && periodEnd !== undefined
        ? `${formatShortDate(new Date(periodStart).toISOString())} – ${formatShortDate(new Date(periodEnd).toISOString())}`
        : null;

    return {
      assignedCount,
      achievedCount,
      complianceRate,
      painArea,
      painPoints,
      painStart: painPoints.length >= 2 && first ? first.score : null,
      painEnd: painPoints.length >= 2 && last ? last.score : null,
      periodLabel,
    };
  }, [focusPainArea, homeworks, logs]);
}

/* ────────────────────────────────────────────────────────────
 * 3. UI
 * ──────────────────────────────────────────────────────────── */

const SHARE_MESSAGE: Record<ShareResult, string> = {
  kakao: "카카오톡 공유창을 열었어요",
  "web-share": "공유를 완료했어요",
  clipboard: "링크를 복사했어요. 카톡에 붙여넣기 해주세요",
  failed: "공유에 실패했어요. 다시 눌러주세요",
};

export function MilestoneReportCard({
  member,
  homeworks,
  logs,
  aiSummary,
  reportToken,
  studioName,
  sessionNumber,
  focusPainArea,
  hideShareButton = false,
  onShared,
}: MilestoneReportCardProps) {
  const metrics = useMilestoneMetrics(homeworks, logs, focusPainArea);
  const session = sessionNumber ?? member.ptSessionCount;
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | ShareResult>("idle");

  const handleShare = useCallback(async () => {
    if (shareStatus === "loading") return;
    vibrate(15);
    setShareStatus("loading");
    const painLine =
      metrics.painArea && metrics.painStart !== null && metrics.painEnd !== null
        ? ` · ${metrics.painArea} 통증 ${metrics.painStart}→${metrics.painEnd}점`
        : "";
    const result = await shareToKakao({
      url: `/report/${reportToken}`,
      title: `${member.name}님 ${session}회차 마일스톤 리포트`,
      description: `숙제 달성률 ${metrics.complianceRate}%${painLine}`,
      buttonTitle: "리포트 보기",
    });
    setShareStatus(result);
    onShared?.(result);
  }, [member.name, metrics, onShared, reportToken, session, shareStatus]);

  const painDelta =
    metrics.painStart !== null && metrics.painEnd !== null ? metrics.painEnd - metrics.painStart : null;

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 240 }}
        className="relative overflow-hidden rounded-[28px] bg-white shadow-[0_8px_40px_rgba(15,23,42,0.10)] ring-1 ring-slate-100"
      >
        {/* Hero */}
        <header className="relative bg-gradient-to-br from-[#3182F6] to-[#1B64DA] px-6 pb-7 pt-6 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-white/10"
          />
          <div className="relative flex items-center justify-between text-sm font-medium text-white/80">
            <span>{studioName}</span>
            {metrics.periodLabel && <span className="tabular-nums">{metrics.periodLabel}</span>}
          </div>
          <p className="relative mt-6 text-base font-semibold text-white/85">{member.name}님</p>
          <h2 className="relative mt-0.5 text-[28px] font-bold leading-tight tracking-tight">
            {session}회차 마일스톤 리포트
          </h2>
        </header>

        <div className="space-y-5 px-6 py-6">
          {/* Compliance */}
          <section>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">숙제 달성률</p>
                <p className="mt-1 text-[15px] text-slate-700">
                  {metrics.assignedCount}회 중 <strong className="font-bold text-slate-900">{metrics.achievedCount}회</strong> 달성
                </p>
              </div>
              <p className="text-[40px] font-bold leading-none tabular-nums text-[#3182F6]">
                {metrics.complianceRate}
                <span className="text-2xl">%</span>
              </p>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full origin-left rounded-full bg-[#3182F6]"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: metrics.complianceRate / 100 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Pain trend */}
          <section>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">
                {metrics.painArea ? `${metrics.painArea} 통증 추이` : "통증 추이"}
              </p>
              {painDelta !== null && (
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                    painDelta <= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                  )}
                >
                  {painDelta <= 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
                  {metrics.painStart}점 → {metrics.painEnd}점
                </span>
              )}
            </div>
            {metrics.painPoints.length >= 2 ? (
              <PainTrendChart points={metrics.painPoints} />
            ) : (
              <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                통증 기록이 2회 이상 쌓이면 추이가 표시돼요
              </p>
            )}
          </section>

          {/* AI continuity summary */}
          <section className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[#3182F6]">
              <Sparkles className="size-4" />
              다음 10회 방향
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-800">{aiSummary}</p>
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 px-6 py-3.5 text-xs text-slate-400">
          <span>담당 원장 확인 완료</span>
          <span className="font-semibold tracking-tight text-slate-500">운동숙제</span>
        </footer>
      </motion.article>

      {!hideShareButton && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleShare}
            disabled={shareStatus === "loading"}
            className="flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#FEE500] text-lg font-bold text-[#191919] shadow-sm transition-transform duration-150 active:scale-[0.98] disabled:opacity-70"
          >
            {shareStatus === "loading" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : shareStatus === "kakao" || shareStatus === "web-share" ? (
              <Check className="size-5" />
            ) : (
              <MessageCircle className="size-5 fill-current" />
            )}
            원장 카톡 1초 전송
          </button>
          {shareStatus !== "idle" && shareStatus !== "loading" && (
            <p
              role="status"
              className={cn(
                "mt-2 text-center text-sm font-medium",
                shareStatus === "failed" ? "text-rose-600" : "text-slate-500",
              )}
            >
              {SHARE_MESSAGE[shareStatus]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PainTrendChart({ points }: { points: PainPoint[] }) {
  const gradientId = useId().replace(/:/g, "");
  const width = 320;
  const height = 150;
  const padX = 20;
  const padTop = 22;
  const padBottom = 26;
  const plotHeight = height - padTop - padBottom;
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  const coords = points.map((point, i) => ({
    x: padX + i * step,
    y: padTop + (1 - point.score / 10) * plotHeight,
    point,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const firstCoord = coords[0];
  const lastCoord = coords[coords.length - 1];
  const baseline = padTop + plotHeight;
  const areaPath =
    firstCoord && lastCoord
      ? `${linePath} L${lastCoord.x.toFixed(1)},${baseline} L${firstCoord.x.toFixed(1)},${baseline} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-auto w-full overflow-visible"
      role="img"
      aria-label={`통증 점수 ${points.map((p) => p.score).join(", ")}점 추이`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3182F6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3182F6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 5, 10].map((tick) => {
        const y = padTop + (1 - tick / 10) * plotHeight;
        return (
          <g key={tick}>
            <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="3 4" />
            <text x={width - padX + 4} y={y + 3.5} fontSize="9" fill="#94A3B8">
              {tick}
            </text>
          </g>
        );
      })}

      <motion.path
        d={areaPath}
        fill={`url(#${gradientId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      />
      <motion.path
        d={linePath}
        fill="none"
        stroke="#3182F6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />

      {coords.map((c, i) => {
        const isEdge = i === 0 || i === coords.length - 1;
        return (
          <g key={`${c.point.at}-${i}`}>
            <circle
              cx={c.x}
              cy={c.y}
              r={isEdge ? 5 : 3.5}
              fill="#FFFFFF"
              stroke="#3182F6"
              strokeWidth={isEdge ? 3 : 2}
            />
            {isEdge && (
              <>
                <text
                  x={c.x}
                  y={c.y - 10}
                  textAnchor={i === 0 ? "start" : "end"}
                  fontSize="13"
                  fontWeight="700"
                  fill="#0F172A"
                >
                  {c.point.score}점
                </text>
                <text
                  x={c.x}
                  y={height - 6}
                  textAnchor={i === 0 ? "start" : "end"}
                  fontSize="10"
                  fill="#94A3B8"
                >
                  {formatShortDate(c.point.at)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default MilestoneReportCard;

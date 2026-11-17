"use client";

import { motion } from "motion/react";
import { ClipboardList, FileBarChart, Sparkles } from "lucide-react";
import { useState } from "react";

import { SessionBriefingCard } from "@/components/briefing/SessionBriefingCard";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DEMO_REPORT_PATH, DEMO_STATUS_META, painTrendLabel } from "@/lib/demo-seed";
import { vibrate } from "@/lib/kakao-share";
import { formatTime } from "@/lib/schedule-display";
import { lessonDateLabel } from "@/components/schedules/LessonDetailSheet";
import { cn } from "@/lib/utils";

import { DemoAssignLayer, type DemoAssignTarget } from "./DemoAssignLayer";
import { useDemo, type DemoMemberProfile } from "./DemoProvider";

const TOSS_EASE = [0.16, 1, 0.3, 1] as const;

function PainTrend({ trend, area }: { trend: readonly number[]; area: string | null }) {
  if (trend.length === 0) return <p className="text-sm text-neutral-500">통증 기록 없음</p>;
  const first = trend[0];
  const last = trend[trend.length - 1];
  const improving = trend.length > 1 && last < first;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-bold text-neutral-500">{area ?? "통증"} 통증 추이</span>
        <span className={cn("text-sm font-bold tabular-nums", improving ? "text-emerald-700" : "text-neutral-800")}>
          {painTrendLabel(trend)}
        </span>
      </div>
      <div className="mt-2 flex h-10 items-end gap-1.5" aria-hidden>
        {trend.map((score, index) => (
          <motion.span
            key={index}
            className={cn(
              "h-full flex-1 origin-bottom rounded-md",
              score >= 6 ? "bg-rose-400" : score >= 4 ? "bg-amber-300" : "bg-emerald-400",
            )}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: Math.max(0.08, score / 10) }}
            transition={{ duration: 0.4, delay: index * 0.06, ease: TOSS_EASE }}
          />
        ))}
      </div>
    </div>
  );
}

function PackageBar({ used, total }: { used: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, used / total) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <motion.div
        className="h-full w-full origin-left rounded-full bg-[var(--ui-accent)]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: ratio }}
        transition={{ duration: 0.4, ease: TOSS_EASE }}
      />
    </div>
  );
}

function MemberCard({
  profile,
  index,
  onAssign,
  onBriefing,
}: {
  profile: DemoMemberProfile;
  index: number;
  onAssign: () => void;
  onBriefing: () => void;
}) {
  const { seed, state, member } = profile;
  const status = DEMO_STATUS_META[seed.status];
  const used = seed.packageTotal - state.packageRemaining;
  const hw = seed.lastHomework;
  const completionRate = Math.round((hw.completedSets / hw.totalSets) * 100);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05, ease: TOSS_EASE }}
      className="flex flex-col gap-4 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-soft)]"
      aria-label={`${seed.name} 회원`}
    >
      <header className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--ui-accent-light)] text-lg font-black text-[var(--ui-accent)]">
          {seed.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black tracking-tight">{seed.name}</h2>
            <span className="text-sm font-semibold text-neutral-500">
              {seed.age}세 · {seed.gender}
            </span>
          </div>
          <p className="truncate text-sm text-neutral-600">{seed.focus}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", status.chip)}>{status.label}</span>
      </header>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-bold text-neutral-500">
            {seed.packageTotal}회 중 {used}회차
          </span>
          <span className={cn("font-black tabular-nums", state.packageRemaining <= 1 ? "text-rose-600" : "text-neutral-900")}>
            잔여 {state.packageRemaining}회
          </span>
        </div>
        <PackageBar used={used} total={seed.packageTotal} />
        <p className="text-xs text-neutral-500">
          {member.nextSessionAt
            ? `다음 수업 ${lessonDateLabel(member.nextSessionAt)} ${formatTime(member.nextSessionAt)}`
            : "예정된 수업 없음"}
        </p>
      </div>

      <PainTrend trend={seed.painTrend} area={seed.painArea} />

      <div className="rounded-[var(--ui-radius-sm)] bg-slate-50 p-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold text-neutral-500">지난 숙제 · {hw.daysAgo}일 전</span>
          <span className="font-bold tabular-nums">완주율 {completionRate}%</span>
        </div>
        <p className="mt-1 font-semibold text-neutral-800">
          {hw.items.map((item) => `${item.name} ${item.sets}세트`).join(" · ")}
        </p>
        {hw.memo && <p className="mt-1.5 text-neutral-600">“{hw.memo}”</p>}
        <p className="mt-1.5 text-xs font-semibold text-neutral-500">{state.homeworkSummary}</p>
      </div>

      {seed.milestone && (
        <div className="rounded-[var(--ui-radius-sm)] border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="text-xs font-bold text-amber-700">🎉 {seed.milestone.sessionNumber}회차 마일스톤 리포트</p>
          <p className="mt-1 font-bold text-amber-950">{seed.milestone.headline}</p>
          <ul className="mt-1 space-y-0.5 text-amber-900">
            {seed.milestone.highlights.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onAssign}
          className="col-span-2 flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-[var(--ui-accent)] text-base font-black text-white transition-transform active:scale-[0.98]"
        >
          <ClipboardList className="size-5" aria-hidden />
          숙제 내기
        </button>
        <button
          type="button"
          onClick={onBriefing}
          className={cn(
            "flex min-h-16 items-center justify-center gap-1.5 rounded-2xl bg-zinc-900 text-sm font-bold text-white transition-transform active:scale-[0.98]",
            !seed.milestone && "col-span-2",
          )}
        >
          <Sparkles className="size-4" aria-hidden />
          3초 브리핑
        </button>
        {seed.milestone && (
          <a
            href={DEMO_REPORT_PATH}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => vibrate(8)}
            className="flex min-h-16 items-center justify-center gap-1.5 rounded-2xl border border-[var(--ui-border)] bg-white text-sm font-bold text-neutral-800 transition-transform active:scale-[0.98]"
          >
            <FileBarChart className="size-4" aria-hidden />
            리포트 미리보기
          </a>
        )}
      </div>
    </motion.article>
  );
}

export function DemoMembersScreen() {
  const demo = useDemo();
  const [assignTarget, setAssignTarget] = useState<DemoAssignTarget | null>(null);
  const [briefingMemberId, setBriefingMemberId] = useState<string | null>(null);
  const briefing = briefingMemberId ? demo.getBriefing(briefingMemberId) : null;

  return (
    <div className="space-y-4">
      <header>
        <p className="font-mono text-xs font-bold text-neutral-500">회원 · 체험</p>
        <h1 className="text-2xl font-bold tracking-tight">회원 {demo.profiles.length}명</h1>
        <p className="mt-1 text-sm text-neutral-600">상태가 다른 샘플 회원으로 숙제 출제·브리핑·리포트를 체험해 보세요.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {demo.profiles.map((profile, index) => (
          <MemberCard
            key={profile.seed.id}
            profile={profile}
            index={index}
            onAssign={() => {
              vibrate(10);
              setAssignTarget({ memberId: profile.seed.id, lessonId: null, label: null });
            }}
            onBriefing={() => {
              vibrate(10);
              setBriefingMemberId(profile.seed.id);
            }}
          />
        ))}
      </div>

      <Sheet open={briefingMemberId !== null} onOpenChange={(open) => !open && setBriefingMemberId(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
        >
          <span className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-200" aria-hidden />
          <SheetTitle className="px-2 text-xl font-black tracking-tight text-slate-900">수업 전 3초 브리핑</SheetTitle>
          <SheetDescription className="mb-4 px-2 text-sm text-slate-500">
            회원이 남긴 숙제 기록을 수업 전에 한눈에 봐요. (샘플 데이터)
          </SheetDescription>
          {briefing?.status === "success" && <SessionBriefingCard briefing={briefing.data} variant="detail" />}
          {briefing?.status === "error" && (
            <p className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">{briefing.message}</p>
          )}
        </SheetContent>
      </Sheet>

      <DemoAssignLayer target={assignTarget} onClose={() => setAssignTarget(null)} />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import type { Briefing, RiskLevel } from '@/lib/briefing/types';
import { useBriefingCard } from './useBriefingCard';

function useReducedMotion(): boolean {
  const [shouldReduce, setShouldReduce] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setShouldReduce(mq.matches);
    const handler = (e: MediaQueryListEvent) => setShouldReduce(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return shouldReduce;
}

interface SessionBriefingCardProps {
  briefing: Briefing;
  /** dashboard: 오늘 수업 목록용(컴팩트) / detail: 회원 상세 이력용 */
  variant?: 'dashboard' | 'detail';
}

const RISK_STYLE: Record<RiskLevel, { chip: string; dot: string; bar: string }> = {
  Safe: {
    chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
    dot: 'bg-emerald-400',
    bar: 'bg-emerald-400',
  },
  Caution: {
    chip: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
    dot: 'bg-amber-400',
    bar: 'bg-amber-400',
  },
  Danger: {
    chip: 'bg-red-500/15 text-red-300 ring-red-400/40',
    dot: 'bg-red-400',
    bar: 'bg-red-400',
  },
};

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  });
}

function BlockTitle({ emoji, children }: { emoji: string; children: string }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-zinc-400">
      <span aria-hidden>{emoji}</span>
      {children}
    </h3>
  );
}

export function SessionBriefingCard({
  briefing,
  variant = 'dashboard',
}: SessionBriefingCardProps) {
  const reduceMotion = useReducedMotion();
  const card = useBriefingCard(briefing.mentalCare.opening);
  const risk = RISK_STYLE[briefing.risk];
  const { checkpoint, modification } = briefing;
  const basedOn = formatDay(briefing.basedOnFeedbackAt);
  const hasPlan =
    modification.avoid.length > 0 || modification.mobilityFirst.length > 0;

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <motion.article
      {...rise(0)}
      aria-label={`${briefing.memberName} 회원 수업 전 브리핑`}
      className="w-full overflow-hidden rounded-3xl bg-zinc-900 p-4 text-zinc-50 shadow-lg ring-1 ring-white/10"
    >
      {/* 헤더: 이름 + 위험도 뱃지 */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight">
            {briefing.memberName} 님
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {basedOn ? `${basedOn} 숙제 기준` : '최근 숙제 응답 없음'}
            {briefing.source === 'fallback' && (
              <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                샘플 데이터
              </span>
            )}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${risk.chip}`}
        >
          <span className={`h-2 w-2 rounded-full ${risk.dot}`} aria-hidden />
          {briefing.risk}
        </span>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        {briefing.riskReasons.join(' · ')}
      </p>

      {/* 1. 체크포인트 */}
      <motion.section {...rise(0.06)} className="mt-4 rounded-2xl bg-zinc-800/60 p-3.5">
        <BlockTitle emoji="📍">체크포인트</BlockTitle>

        <div className="flex items-baseline justify-between">
          <span className="text-sm text-zinc-300">숙제 수행</span>
          <span className="text-sm font-semibold">{checkpoint.completionLabel}</span>
        </div>
        {checkpoint.completionRate !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-700">
            <motion.div
              className={`h-full w-full origin-left rounded-full ${risk.bar}`}
              initial={reduceMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: checkpoint.completionRate / 100 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}

        {(checkpoint.painChips.length > 0 || checkpoint.painScore !== null) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {checkpoint.painChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-zinc-700 px-3 py-1 text-sm font-medium text-zinc-100"
              >
                {chip} 불편
              </span>
            ))}
            {checkpoint.painScore !== null && (
              <span className="text-sm text-zinc-300">
                통증 <b className="text-zinc-50">{checkpoint.painScore}/10</b>
              </span>
            )}
          </div>
        )}

        {checkpoint.memoSummary && (
          <p className="mt-3 rounded-xl bg-zinc-900/70 px-3 py-2 text-sm leading-relaxed text-zinc-200">
            “{checkpoint.memoSummary}”
          </p>
        )}
      </motion.section>

      {/* 2. 수정 계획 */}
      <motion.section {...rise(0.12)} className="mt-3 rounded-2xl bg-zinc-800/60 p-3.5">
        <BlockTitle emoji="🛠️">수정 계획 · 제안</BlockTitle>
        {hasPlan && (
          <div className="space-y-2.5 text-sm">
            {modification.avoid.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-red-300">오늘 주의</p>
                <ul className="space-y-1 text-zinc-200">
                  {modification.avoid.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {modification.mobilityFirst.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-emerald-300">먼저 해볼 것</p>
                <ul className="space-y-1 text-zinc-200">
                  {modification.mobilityFirst.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <p className={`${hasPlan ? 'mt-2.5' : ''} text-xs leading-relaxed text-zinc-400`}>
          {modification.note}
        </p>
      </motion.section>

      {/* 3. 멘탈 케어 */}
      <motion.section {...rise(0.18)} className="mt-3 rounded-2xl bg-zinc-800/60 p-3.5">
        <BlockTitle emoji="💬">오프닝 멘트</BlockTitle>

        {card.editing ? (
          <textarea
            value={card.draft}
            onChange={(event) => card.setDraft(event.target.value)}
            rows={variant === 'detail' ? 4 : 3}
            aria-label="오프닝 멘트 수정"
            className="w-full resize-none rounded-xl bg-zinc-900 p-3 text-[15px] leading-relaxed text-zinc-50 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-sky-400"
          />
        ) : (
          <p className="text-[15px] leading-relaxed text-zinc-50">{card.draft}</p>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <motion.button
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            onClick={card.toggleEdit}
            className="min-h-12 rounded-xl bg-zinc-700 text-sm font-semibold text-zinc-50"
          >
            {card.editing ? '완료' : '수정'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            onClick={card.reset}
            disabled={!card.isEdited}
            className="min-h-12 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-300 disabled:opacity-40"
          >
            원래대로
          </motion.button>
          <motion.button
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            onClick={card.copy}
            className="min-h-12 rounded-xl bg-sky-500 text-sm font-bold text-zinc-950"
          >
            복사
          </motion.button>
        </div>
        <p className="mt-2 h-4 text-xs text-zinc-400" role="status" aria-live="polite">
          {card.copied ? '복사했어요' : card.copyFailed ? '복사하지 못했어요. 길게 눌러 복사해 주세요' : ''}
        </p>
      </motion.section>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        회원 자기 보고를 정리한 참고 정보예요. 의료적 판단이 아니며, 운동 변경은 원장님이 결정해요.
      </p>
    </motion.article>
  );
}

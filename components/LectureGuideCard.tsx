"use client";

import type { LectureGuide } from "@/lib/schemas";
import { BookMarked, Lightbulb, MessageCircleQuestion, FlaskConical } from "lucide-react";

const sections: {
  key: keyof Pick<LectureGuide, "emphasis" | "analogies" | "faq" | "quickLab">;
  title: string;
  description: string;
  Icon: typeof BookMarked;
}[] = [
  {
    key: "emphasis",
    title: "핵심 강조점",
    description: "수업에서 반드시 짚어야 할 기둥 개념",
    Icon: BookMarked,
  },
  {
    key: "analogies",
    title: "전략적 비유",
    description: "추상 개념을 일상 언어로 풀어 설명하는 아이디어",
    Icon: Lightbulb,
  },
  {
    key: "faq",
    title: "돌발 질문 대응",
    description: "혼동 지점·날카로운 질문에 대한 답변 초안",
    Icon: MessageCircleQuestion,
  },
  {
    key: "quickLab",
    title: "즉석 실습",
    description: "5분 내외 초단기 적용 과제",
    Icon: FlaskConical,
  },
];

interface LectureGuideCardProps {
  guide: LectureGuide;
}

export function LectureGuideCard({ guide }: LectureGuideCardProps) {
  return (
    <section
      className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-slate-50/80 p-5 shadow-sm"
      aria-labelledby="lecture-guide-heading"
    >
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600 mb-1">
          Instructional Designer
        </p>
        <h2 id="lecture-guide-heading" className="text-lg font-bold text-slate-900">
          AI 교수용 가이드
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          교안 맥락에 맞춘 강조·비유·Q&amp;A·미니 실습 제안입니다.
        </p>
      </div>

      <div className="space-y-2">
        {sections.map(({ key, title, description, Icon }) => {
          const items = guide[key].filter((s) => s.trim().length > 0);
          if (items.length === 0) return null;
          return (
            <details
              key={key}
              className="group rounded-xl border border-slate-200/90 bg-white/95 open:shadow-sm open:border-violet-200/70 transition-[box-shadow,border-color]"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex-1 text-left min-w-0">
                  <span className="block font-semibold text-slate-900 text-sm">{title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
                </span>
                <span className="text-xs font-medium text-violet-600 shrink-0 group-open:hidden">
                  펼치기
                </span>
                <span className="text-xs font-medium text-violet-600 shrink-0 hidden group-open:inline">
                  접기
                </span>
              </summary>
              <ul className="px-4 pb-4 pt-0 space-y-2.5 border-t border-slate-100">
                {items.map((line, i) => (
                  <li
                    key={`${key}-${i}`}
                    className="text-sm text-slate-700 leading-relaxed pl-2 border-l-2 border-violet-200"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}

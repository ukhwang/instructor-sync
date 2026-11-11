"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createExerciseCatalog, seedRecords } from "@/lib/exercises/catalog";
import { loadExerciseRecords } from "@/lib/exercises/provider";
import { REHAB_EXERCISES, searchRehabExercises, type PainArea } from "@/lib/exercises/rehab-db";
import type { ExerciseRecord } from "@/lib/exercises/types";

export function ExercisePicker({
  value,
  onSelect,
  disabled = false,
  label = "운동 검색",
}: {
  value: string;
  onSelect: (exercise: ExerciseRecord) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedPainArea, setSelectedPainArea] = useState<PainArea | "전체">("전체");
  const inputId = useId();

  // 재활 DB 통합 검색
  const rehabResults = useMemo(
    () => searchRehabExercises(query, selectedPainArea),
    [query, selectedPainArea]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="block text-sm font-black">
          {label}
        </label>
        <span className="text-xs text-neutral-500 font-medium">
          원하는 운동을 탭하면 즉시 담깁니다
        </span>
      </div>

      {/* 5대 통증 부위 필터 칩 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {(["전체", "허리", "고관절", "어깨", "무릎", "목"] as const).map((area) => (
          <button
            key={area}
            type="button"
            onClick={() => setSelectedPainArea(area)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              selectedPainArea === area
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {area}
          </button>
        ))}
      </div>

      <input
        id={inputId}
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="예: 버드독, 무릎, 폼롤러, 거북목"
        className="brutalist-input text-sm"
      />

      {value && (
        <div className="rounded-xl border border-[var(--ui-accent)] bg-[var(--ui-accent-light)] px-3 py-2 text-xs font-bold">
          선택된 동작: {value}
        </div>
      )}

      {!disabled && (
        <div
          className="max-h-64 overflow-y-auto space-y-2 pr-1"
          role="group"
          aria-label="운동 검색 결과"
        >
          {rehabResults.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                // ExerciseRecord 호환 형태로 매핑하여 전달
                const record: ExerciseRecord = {
                  id: item.id,
                  exercise_id: item.id,
                  name: item.name,
                  category: item.category,
                  default_sets: item.defaultSets,
                  default_reps: item.defaultReps,
                  default_cue: item.defaultCue,
                  default_effort_kind: "reps",
                  default_rep_count: parseInt(item.defaultReps, 10) || 10,
                  default_hold_seconds: item.defaultReps.includes("초") ? 30 : null,
                  default_seconds_per_rep: null,
                  default_rest_seconds: item.defaultRestSec,
                  default_per_side: item.defaultReps.includes("각"),
                  aliases: [item.koreanOnlyName, item.englishName],
                  tags: item.tags,
                  equipment: [item.equipment],
                  content_version: 1,
                  source_note: "재활 마스터 DB",
                  media_url: item.gifUrl || item.posterUrl,
                  media_alt: `${item.name} 가이드`,
                  source: "seed",
                  status: "published",
                };
                onSelect(record);
              }}
              className="w-full flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5 text-left hover:bg-neutral-50 hover:border-black transition-all"
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.gifUrl || item.posterUrl}
                  alt={item.name}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="block text-sm font-black text-neutral-900 truncate">
                    {item.koreanOnlyName}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 shrink-0">
                    {item.category}
                  </span>
                </div>
                <span className="block text-xs text-neutral-500 line-clamp-1 mt-0.5">
                  {item.defaultCue}
                </span>
                <span className="block text-[10px] text-emerald-700 font-bold mt-0.5">
                  기본 {item.defaultSets}세트 · {item.defaultReps}
                </span>
              </div>

              <span className="shrink-0 text-xs font-bold text-neutral-400 group-hover:text-black">
                + 추가
              </span>
            </button>
          ))}
          {rehabResults.length === 0 && (
            <p className="p-4 text-center text-xs text-neutral-500">
              검색 결과가 없습니다. 다른 이름이나 부위로 검색해 주세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

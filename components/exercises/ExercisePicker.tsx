"use client";

import { useEffect, useId, useMemo, useState } from 'react';
import { createExerciseCatalog, seedRecords } from '@/lib/exercises/catalog';
import { loadExerciseRecords } from '@/lib/exercises/provider';
import type { ExerciseRecord } from '@/lib/exercises/types';

export function ExercisePicker({
  value,
  onSelect,
  disabled = false,
  label = '운동 검색',
}: {
  value: string;
  onSelect: (exercise: ExerciseRecord) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState(seedRecords);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inputId = useId();
  useEffect(() => {
    let active = true;
    loadExerciseRecords().then((next) => { if (active) { setRecords(next); setLoadError(false); } })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [attempt]);
  const results = useMemo(() => createExerciseCatalog(records).search(query), [query, records]);
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-black">{label}</label>
      <input
        id={inputId}
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="예: 밴드로 어깨 운동, 브릿지"
        className="brutalist-input text-sm"
      />
      {value && <div className="rounded-xl border border-[var(--ui-accent)] bg-[var(--ui-accent-light)] px-3 py-2 text-sm font-bold">선택됨: {value}</div>}
      {loadError && <p role="status" className="text-xs text-neutral-600">추가 운동 목록을 불러오지 못해 기본 목록을 표시합니다. <button type="button" onClick={() => setAttempt((value) => value + 1)} className="underline">다시 시도</button></p>}
      {!disabled && <div className="max-h-48 overflow-y-auto space-y-1" role="group" aria-label="운동 검색 결과">
        {results.map((exercise) => (
          <button key={exercise.exercise_id} type="button" onClick={() => onSelect(exercise)} className="w-full rounded-lg border border-neutral-200 bg-white p-2 text-left hover:bg-neutral-50">
            <span className="block text-sm font-black">{exercise.name}</span>
            <span className="block text-xs text-neutral-600">{exercise.category} · {exercise.default_cue}</span>
          </button>
        ))}
        {results.length === 0 && <p className="p-2 text-xs text-neutral-500">검색 결과가 없습니다. 다른 이름이나 부위로 검색해 주세요.</p>}
      </div>}
    </div>
  );
}

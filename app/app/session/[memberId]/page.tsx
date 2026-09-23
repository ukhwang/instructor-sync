"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  getMemberById,
  getHomeworksForMember,
  addSessionNote,
  getSessionNotesForMember,
  getMemberImportRecords,
} from "@/lib/db";
import { Member, Homework, MemberImportRecord, SessionNote } from "@/lib/types";
import { generateOpeningLine } from "@/lib/template";
import { getSeoulDateTimeString } from "@/lib/token";
import { COPY } from "@/lib/copy";
import { ExercisePicker } from "@/components/exercises/ExercisePicker";
import {
  parseStructuredSessionNote,
  serializeStructuredSessionNote,
} from "@/lib/session-note";

const BODY_AREAS = ["목/어깨", "등", "허리", "골반", "무릎", "발목", "전신"];
const OBSERVATIONS = [
  "움직임 제한",
  "좌우 차이",
  "안정성 부족",
  "힘 조절 어려움",
  "동작 양호",
];
const PROGRAM_GOALS = [
  "움직임 안정성",
  "가동 범위 향상",
  "좌우 균형",
  "근력 유지",
  "동작 숙련",
];

function ChoiceChips({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`min-h-12 px-4 py-2 rounded-xl border text-sm font-semibold transition-all duration-150 ${
            value === option
              ? "bg-[var(--ui-accent)] text-white border-[var(--ui-accent)] scale-[0.98] shadow-sm"
              : disabled
              ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed"
              : "bg-white text-neutral-700 border-[var(--ui-border)] hover:bg-[var(--ui-accent-light)] hover:text-[var(--ui-accent)]"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export default function NextSessionAlertPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const resolvedParams = use(params);
  const memberId = resolvedParams.memberId;

  const [member, setMember] = useState<Member | null>(null);
  const [latestHomework, setLatestHomework] = useState<Homework | null>(null);
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);
  const [importRecords, setImportRecords] = useState<MemberImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // New structured session note
  const [bodyArea, setBodyArea] = useState("");
  const [observation, setObservation] = useState("");
  const [exercise, setExercise] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [programGoal, setProgramGoal] = useState("");
  const [optionalMemo, setOptionalMemo] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [savedExercise, setSavedExercise] = useState("");
  const [savedExerciseId, setSavedExerciseId] = useState("");
  const [savedGoal, setSavedGoal] = useState("");
  const [noteError, setNoteError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [m, hwList, notes, imported] = await Promise.all([
        getMemberById(memberId),
        getHomeworksForMember(memberId),
        getSessionNotesForMember(memberId),
        getMemberImportRecords(memberId),
      ]);
      setMember(m);
      setLatestHomework(hwList.length > 0 ? hwList[0] : null);
      setSessionNotes(notes);
      setImportRecords(imported);
    } catch {
      setLoadError("수업 준비 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bodyArea || !observation || !exercise || !programGoal) return;

    setNoteLoading(true);
    setNoteError("");
    try {
      const created = await addSessionNote(
        memberId,
        serializeStructuredSessionNote({
          bodyArea,
          observation,
          exercise,
          goal: programGoal,
          ...(optionalMemo.trim() ? { memo: optionalMemo.trim() } : {}),
        })
      );
      setSessionNotes((prev) => [created, ...prev]);
      setSavedExercise(exercise);
      setSavedExerciseId(exerciseId);
      setSavedGoal(programGoal);
      setBodyArea("");
      setObservation("");
      setExercise("");
      setExerciseId("");
      setProgramGoal("");
      setOptionalMemo("");
    } catch {
      setNoteError("수업 기록을 저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.");
    } finally {
      setNoteLoading(false);
    }
  };

  const handleCopyOpening = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="brutalist-box p-8 bg-white text-center font-bold">
        수업 준비 내용을 불러오는 중...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="brutalist-box p-8 bg-white text-center space-y-4">
        <p className="font-bold text-red-800">{loadError}</p>
        <button type="button" onClick={() => void loadData()} className="brutalist-btn-primary text-xs">다시 시도</button>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="brutalist-box p-8 bg-white text-center">
        <h2 className="text-xl font-black mb-3">회원 정보를 찾을 수 없습니다.</h2>
        <Link href="/app/members" className="brutalist-btn-primary text-xs">
          회원 목록으로 가기
        </Link>
      </div>
    );
  }

  const openingLine = latestHomework
    ? latestHomework.opening_line ||
      generateOpeningLine(latestHomework.items || [], latestHomework.logs || [])
    : `${member.name}님, 오늘 수업 시작 전 지난주 컨디션부터 먼저 확인해볼게요.`;

  const isPro = true;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Breadcrumb & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-neutral-600">
          <Link href="/app" className="hover:underline">
            ← 홈
          </Link>
          <span>/</span>
          <Link href={`/app/members/${member.id}`} className="hover:underline">
            {member.name}
          </Link>
          <span>/</span>
          <span className="text-black font-black">수업 시작 전 확인할 내용</span>
        </div>

        <Link
          href={`/app/homework/new?memberId=${member.id}`}
          className="brutalist-btn-yellow text-xs font-black"
        >
          + 다음 숙제 작성하기
        </Link>
      </div>

      {/* Hero: opening note for session preparation */}
      <div className="brutalist-box p-6 md:p-8 bg-yellow-200 border-l-8 border-l-black space-y-4">
        <div className="flex items-center justify-between pb-2 border-b-2 border-black">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-black bg-black text-white px-2 py-0.5">
              수업 준비 메모
            </span>
            <span className="text-sm font-black text-black">
              오늘 수업에서 물어볼 내용
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-neutral-800">
            수업 시작 1분 전 체크
          </span>
        </div>

        {/* Free Plan Gate / Pro Unlocked Text */}
        {isPro ? (
          <div className="space-y-4">
            <div className="p-4 bg-white border-2 border-black">
              <p className="text-lg md:text-xl font-black text-black leading-relaxed">
                “{openingLine}”
              </p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-800">
                회원이 남긴 단어와 숙제 결과를 정확히 인용하여 수업을 시작합니다.
              </span>
              <button
                onClick={() => handleCopyOpening(openingLine)}
                className="brutalist-btn-primary text-xs font-black shrink-0"
              >
                {copied ? "✓ 멘트 복사됨" : "오프닝 멘트 복사"}
              </button>
            </div>
          </div>
        ) : (
          <div className="relative p-6 bg-white border-2 border-black overflow-hidden space-y-3">
            {/* Blurred Mock Text */}
            <div className="filter blur-sm select-none opacity-40">
              <p className="text-lg font-black leading-relaxed">
                “지난주에 글루트 브릿지 3세트 진행하셨고 허리가 뻐근하다고 하셔서
                오늘은 그 부분부터 집중적으로 체크하고 진행할게요.”
              </p>
            </div>
            {/* Lock Overlay */}
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
              <span className="font-mono text-xs font-black bg-black text-white px-2.5 py-1 mb-2">
                PRO 플랜 전용 기능
              </span>
              <p className="text-sm font-black text-neutral-900 mb-3">
                {COPY.SESSION_ALERT.PRO_LOCK_MSG}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Member Goal & Record Summary */}
      <div className="brutalist-box p-6 md:p-8 bg-white space-y-5">
        <h2 className="text-lg font-black pb-2 border-b-2 border-black">
          회원 기록 요약
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-neutral-100 border-2 border-black space-y-1">
            <div className="font-mono text-xs font-bold text-neutral-600">
              회원 목표
            </div>
            <div className="text-sm font-black text-black">
              {member.end_state || "설정된 목표 없음"}
            </div>
          </div>

          <div className="p-3 bg-neutral-100 border-2 border-black space-y-1">
            <div className="font-mono text-xs font-bold text-neutral-600">
              패키지 잔여 횟수
            </div>
            <div className="text-sm font-black text-black">
              잔여 {member.package_remaining}회 / 총 {member.package_total}회
              {member.package_remaining <= 4 && (
                <span className="ml-2 font-mono text-xs text-red-600 font-bold">
                  (만료 임박)
                </span>
              )}
            </div>
          </div>
        </div>

        {importRecords.length > 0 && (
          <details className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-accent-light)] p-4" open>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-[var(--ui-accent)]">도입 시 가져온 기록</div>
                  <p className="mt-1 text-sm font-bold text-neutral-900">
                    {importRecords[0].summary || "요약이 없습니다. 원문을 확인해주세요."}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-neutral-600">
                  {importRecords[0].recorded_from || importRecords[0].recorded_to
                    ? `${importRecords[0].recorded_from || "날짜 미상"} ~ ${importRecords[0].recorded_to || "날짜 미상"}`
                    : "과거 기록 · 날짜 미상"}
                </span>
              </div>
            </summary>
            <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
              <p className="whitespace-pre-wrap break-words text-sm text-neutral-800">
                {importRecords[0].raw_text}
              </p>
              {importRecords.length > 1 && (
                <Link href={`/app/members/${member.id}`} className="mt-3 inline-block text-xs font-black underline">
                  이전 기록 {importRecords.length}건 전체 보기 →
                </Link>
              )}
            </div>
          </details>
        )}

        {/* Latest Homework & Member Direct Quotes */}
        <div className="space-y-2 pt-2">
          <div className="font-mono text-xs font-black uppercase text-neutral-700">
            직전 숙제 기록 및 회원 제출 원문
          </div>

          {latestHomework ? (
            <div className="p-4 bg-neutral-50 border-2 border-black space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-neutral-600">
                  {getSeoulDateTimeString(latestHomework.created_at)} 숙제
                </span>
                <Link
                  href={`/app/homework/${latestHomework.id}`}
                  className="text-xs font-bold underline"
                >
                  숙제 원본 보기 →
                </Link>
              </div>

              <div className="text-sm font-bold text-black">
                <span className="font-mono text-xs bg-neutral-200 px-1 py-0.5 mr-1.5 border border-neutral-400">
                  Why
                </span>
                {latestHomework.why}
              </div>

              {latestHomework.logs && latestHomework.logs.length > 0 ? (
                <div className="space-y-1.5 pt-2 border-t border-neutral-300">
                  <div className="font-mono text-xs font-bold text-neutral-600">
                    회원 응답 기록:
                  </div>
                  {latestHomework.logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 bg-white border border-black text-xs space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-mono font-bold text-neutral-500">
                        <span>
                          {log.kind === "complete"
                            ? "완료"
                            : log.kind === "cant"
                            ? "못 함"
                            : log.kind === "pain"
                            ? "통증 보고"
                            : "메모"}
                        </span>
                        <span>{getSeoulDateTimeString(log.created_at)}</span>
                      </div>
                      {log.payload?.note && (
                        <p className="text-sm font-bold text-black mt-1">
                          “{log.payload.note}”
                        </p>
                      )}
                      {log.payload?.pain_area && (
                        <p className="text-sm font-bold text-red-700 mt-1">
                          통증 부위: “{log.payload.pain_area}”
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-neutral-500 pt-1">
                  회원이 아직 숙제 기록을 제출하지 않았습니다.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs font-mono text-neutral-500 py-3 text-center border-2 border-dashed border-neutral-300">
              부여된 이전 숙제가 없습니다.
            </p>
          )}
        </div>
      </div>

      {/* Session Notes Form & List */}
      <div className="brutalist-box p-6 md:p-8 bg-white space-y-5">
        <div className="pb-4 border-b border-[var(--ui-border)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-[var(--ui-accent)] bg-[var(--ui-accent-light)] rounded-full px-2.5 py-1">15초 기록</span>
            <span className="text-xs text-neutral-500">4번의 선택</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">오늘 수업은 어땠나요?</h2>
          <p className="text-xs font-medium text-neutral-600 mt-1">
            네 가지를 순서대로 선택하면 키보드 없이 기록할 수 있습니다.
          </p>
        </div>

        <form onSubmit={handleAddNote} className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="text-sm font-black">1. 부위</legend>
            <ChoiceChips options={BODY_AREAS} value={bodyArea} onChange={setBodyArea} />
          </fieldset>

          <fieldset className="space-y-2" disabled={!bodyArea}>
            <legend className="text-sm font-black">2. 관찰 상태</legend>
            <ChoiceChips
              options={OBSERVATIONS}
              value={observation}
              onChange={setObservation}
              disabled={!bodyArea}
            />
          </fieldset>

          <fieldset className="space-y-2" disabled={!observation}>
            <legend className="text-sm font-black">3. 운동 제안</legend>
            <ExercisePicker
              value={exercise}
              onSelect={(selected) => { setExercise(selected.name); setExerciseId(selected.exercise_id); }}
              disabled={!observation}
              label="운동 검색 및 선택"
            />
          </fieldset>

          <fieldset className="space-y-2" disabled={!exercise}>
            <legend className="text-sm font-black">4. 프로그램 목표</legend>
            <ChoiceChips
              options={PROGRAM_GOALS}
              value={programGoal}
              onChange={setProgramGoal}
              disabled={!exercise}
            />
          </fieldset>

          <div>
            <label className="block text-xs font-bold mb-1" htmlFor="session-note-memo">
              추가 메모 (선택)
            </label>
            <textarea
              id="session-note-memo"
              rows={2}
              value={optionalMemo}
              onChange={(e) => setOptionalMemo(e.target.value)}
              placeholder="필요한 내용만 짧게 남겨주세요."
              className="brutalist-input text-sm resize-none"
            />
          </div>

          <div className="sticky bottom-3 z-10 -mx-2 rounded-2xl border border-[var(--ui-border)] bg-white/95 p-2 shadow-[0_8px_24px_rgba(23,23,23,0.10)] backdrop-blur sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <button
              type="submit"
              disabled={noteLoading || !bodyArea || !observation || !exercise || !programGoal}
              className="brutalist-btn-primary min-h-12 w-full text-sm font-bold sm:w-auto"
            >
              {noteLoading ? "저장 중..." : "4단계 기록 저장"}
            </button>
          </div>
        </form>

        {noteError && <p role="alert" className="text-sm text-red-700">{noteError}</p>}
        {savedExercise && (
          <div className="p-4 bg-yellow-200 border-2 border-black space-y-3" role="status">
            <div>
              <p className="text-sm font-black">수업 기록을 저장했습니다.</p>
              <p className="text-xs font-medium text-neutral-700 mt-1">
                선택한 운동 · {savedExercise}
              </p>
            </div>
            <Link
              href={`/app/homework/new?memberId=${encodeURIComponent(member.id)}&exercise=${encodeURIComponent(savedExercise)}&exerciseId=${encodeURIComponent(savedExerciseId)}&goal=${encodeURIComponent(savedGoal)}`}
              className="brutalist-btn-yellow inline-block text-xs font-black"
            >
              숙제 만들기 →
            </Link>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t-2 border-black">
          {sessionNotes.map((n) => {
            const structured = parseStructuredSessionNote(n.note);
            return (
              <div
                key={n.id}
                className="p-3 bg-neutral-50 border border-black text-xs font-medium text-neutral-800"
              >
                <div className="font-mono text-[11px] text-neutral-500 mb-2">
                  {getSeoulDateTimeString(n.created_at)}
                </div>
                {structured ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <p><span className="font-black">부위</span> · {structured.bodyArea}</p>
                      <p><span className="font-black">관찰</span> · {structured.observation}</p>
                      <p><span className="font-black">운동</span> · {structured.exercise}</p>
                      <p><span className="font-black">목표</span> · {structured.goal}</p>
                    </div>
                    {structured.memo && (
                      <p className="whitespace-pre-wrap pt-2 border-t border-neutral-300">
                        {structured.memo}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="inline-block font-mono text-[10px] font-black bg-neutral-200 px-1.5 py-0.5 mb-1">
                      기존 메모
                    </span>
                    <p className="whitespace-pre-wrap">{n.note}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

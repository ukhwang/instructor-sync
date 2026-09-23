"use client";

import { useEffect, useRef, useState } from "react";
import { submitHomeworkFeedbackV2Rpc } from "@/lib/db";
import {
  canSubmitHomework,
  clearSubmissionDraft,
  loadSubmissionDraft,
  prepareSubmissionDraft,
  saveSubmissionDraft,
} from "@/lib/homework-submission-draft";
import { HomeworkItem, HomeworkLog } from "@/lib/types";
import { COPY } from "@/lib/copy";
import { getHomeworkExerciseDescription, getHomeworkExerciseMedia } from "@/lib/exercise-media";
import { ExerciseMedia } from "./ExerciseMedia";
import { unlockAudioFromGesture, VoiceCoachSession } from "./VoiceCoachSession";

interface MemberHomeworkClientProps {
  token: string;
  homework: {
    id: string;
    why: string;
    status: string;
    token?: string;
    token_expires_at: string;
    created_at: string;
  };
  member: {
    id?: string;
    name: string;
  };
  items: HomeworkItem[];
  initialLogs: HomeworkLog[];
}

export function MemberHomeworkClient({
  token,
  homework,
  member,
  items,
  initialLogs,
}: MemberHomeworkClientProps) {
  const initialSubmissionLog = [...initialLogs]
    .reverse()
    .find((log) => log.kind === "complete" || log.kind === "partial" || log.kind === "cant");
  const [selectedKind, setSelectedKind] = useState<"cant" | null>(null);
  const [completedItemIds, setCompletedItemIds] = useState<string[]>(
    initialSubmissionLog?.payload?.completed_items || []
  );
  const [discomfortLevel, setDiscomfortLevel] = useState(1);
  const [userNote, setUserNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(initialSubmissionLog));
  const [coachOpen, setCoachOpen] = useState(false);
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  const feedbackRef = useRef<HTMLFormElement>(null);
  const submissionInFlightRef = useRef(false);
  const lastSubmissionAttemptRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  // The submission RPC writes the completion and discomfort logs together.
  // The discomfort row is last, so do not use it as the member's message.
  const [submittedQuote, setSubmittedQuote] = useState(
    initialSubmissionLog
      ? initialSubmissionLog.payload?.note ||
        (initialSubmissionLog.kind === "complete"
          ? "숙제 완료"
          : initialSubmissionLog.kind === "partial" ? "일부 동작 수행" : "숙제 미완료")
      : ""
  );

  useEffect(() => {
    if (initialSubmissionLog) return;
    const draft = loadSubmissionDraft(homework.id);
    if (!draft) return;
    setDiscomfortLevel(draft.discomfortLevel);
    setUserNote(draft.note);
    setSelectedKind(draft.explicitlyCant ? "cant" : null);
    const allowedIds = new Set(items.map((item) => item.id));
    setCompletedItemIds(draft.completedItemIds.filter((id) => allowedIds.has(id)));
  }, [homework.id, initialSubmissionLog, items]);

  const explicitlyCant = selectedKind === "cant";
  const canSubmit = canSubmitHomework(completedItemIds, explicitlyCant);
  const requiredItemIds = items
    .filter((item) => (item.requirement ?? "required") === "required")
    .map((item) => item.id);
  const completedAllRequired = !explicitlyCant
    && requiredItemIds.length > 0
    && requiredItemIds.every((id) => completedItemIds.includes(id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submissionInFlightRef.current) {
      if (!canSubmit) {
      alert("수행한 동작을 선택하거나 못 했다고 알려주세요.");
      }
      return;
    }

    submissionInFlightRef.current = true;
    setSubmitting(true);
    try {
      const note = userNote.trim();
      const draft = prepareSubmissionDraft({
        homeworkId: homework.id,
        completedItemIds: [...completedItemIds].sort(),
        discomfortLevel,
        note,
        explicitlyCant,
      });
      const previousAttempt = lastSubmissionAttemptRef.current;
      if (previousAttempt?.fingerprint === draft.fingerprint) {
        draft.requestId = previousAttempt.requestId;
      }
      lastSubmissionAttemptRef.current = { fingerprint: draft.fingerprint, requestId: draft.requestId };
      saveSubmissionDraft(draft);
      const result = await submitHomeworkFeedbackV2Rpc(token, explicitlyCant ? [] : draft.completedItemIds, {
        discomfort_level: discomfortLevel,
        note: note || undefined,
      }, draft.requestId);
      if (!result.success) {
        if (result.reason === "already_submitted") {
          clearSubmissionDraft(homework.id);
          lastSubmissionAttemptRef.current = null;
          window.location.reload();
          return;
        }
        throw new Error(result.reason || "submit_failed");
      }

      const quote = note || (result.result === "complete" ? "필수 동작을 모두 수행했어요" : result.result === "partial" ? "일부 동작을 수행했어요" : "숙제를 진행하지 못했어요");

      setSubmittedQuote(quote);
      setSubmitted(true);
      clearSubmissionDraft(homework.id);
      lastSubmissionAttemptRef.current = null;
    } catch {
      alert("기록 전달에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  // Submitted Confirmation View
  if (submitted) {
    return (
      <div className="brutalist-box p-6 md:p-8 bg-white space-y-6 animate-in fade-in duration-300">
        <div>
          <div className="font-mono text-xs font-black bg-black text-white px-2 py-0.5 inline-block mb-2">
            기록 완료
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-black">
            {member.name}님, {COPY.MEMBER.SUBMIT_SUCCESS_TITLE}
          </h2>
        </div>

        {/* Member Word Quoting Box */}
        <div className="p-4 bg-yellow-100 border-2 border-black space-y-1.5">
          <div className="font-mono text-xs font-bold text-neutral-600">
            강사님께 전달된 내용
          </div>
          <p className="text-base md:text-lg font-black text-black leading-relaxed">
            “{submittedQuote}”
          </p>
        </div>

        <p className="text-sm font-bold text-neutral-800 leading-relaxed border-l-4 border-black pl-3 py-1">
          {COPY.MEMBER.RECORD_CONTINUATION}
        </p>

        <p className="pt-2 text-xs font-bold text-neutral-600 font-mono">
          확인 제출된 기록은 이 링크에서 수정할 수 없습니다.
        </p>
      </div>
    );
  }

  const handleStartCoach = async () => {
    const ctx = await unlockAudioFromGesture();
    setAudioCtx(ctx);
    setCoachOpen(true);
  };

  const handleCoachFinished = () => {
    setCoachOpen(false);
    window.setTimeout(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const firstBtn = feedbackRef.current?.querySelector("button[type='button']");
      if (firstBtn instanceof HTMLElement) firstBtn.focus();
    }, 50);
  };

  return (
    <div className="space-y-6">
      {coachOpen ? (
        <VoiceCoachSession
          items={items}
          audioCtx={audioCtx}
          onClose={() => setCoachOpen(false)}
          onFinished={handleCoachFinished}
        />
      ) : null}

      {/* 1. WHY - The absolute largest typography on the screen */}
      <div className="brutalist-box p-6 md:p-8 bg-white space-y-3">
        <span className="font-mono text-xs font-black uppercase tracking-wider text-neutral-600">
          {COPY.MEMBER.WHY_HEADING}
        </span>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-snug text-black">
          “{homework.why}”
        </h1>
      </div>

      {/* 2. Movement Items (1~3 items) */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase font-mono tracking-wider text-neutral-700">
          {COPY.MEMBER.EXERCISE_LIST_HEADING} ({items.length}가지)
        </h2>

        <div className="space-y-3">
          {items.map((item, idx) => {
            const media = getHomeworkExerciseMedia(item);
            return (
            <div
              key={item.id || idx}
              className="brutalist-box p-5 bg-white space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black bg-black text-white px-2 py-0.5">
                    동작 0{idx + 1}
                  </span>
                  <h3 className="text-lg font-black text-black">
                    {item.name}
                  </h3>
                </div>
                <span className="font-mono text-xs font-bold bg-neutral-100 border border-black px-2.5 py-1">
                  {item.target_sets}세트 {item.target_reps}
                </span>
              </div>

              {media ? (
                <ExerciseMedia
                  media={media}
                  description={getHomeworkExerciseDescription(item)}
                />
              ) : null}

              <label className="flex items-center gap-3 border-t border-neutral-200 pt-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={completedItemIds.includes(item.id)}
                  disabled={submitting}
                  onChange={(event) => {
                    setSelectedKind(null);
                    setCompletedItemIds((current) => event.target.checked
                      ? [...new Set([...current, item.id])]
                      : current.filter((id) => id !== item.id));
                  }}
                  className="h-5 w-5 accent-[var(--ui-accent)]"
                />
                <span>{(item.requirement ?? "required") === "required" ? "이 동작을 수행했어요" : "선택 동작도 수행했어요"}</span>
              </label>
              {item.cue && (
                <div className="text-xs sm:text-sm font-medium text-neutral-800 bg-neutral-50 p-2.5 border border-neutral-300">
                  <span className="font-bold mr-1">포인트:</span>
                  {item.cue}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={handleStartCoach}
        className="w-full brutalist-btn-yellow min-h-12 py-4 text-lg font-bold"
      >
        {COPY.MEMBER.VOICE_COACH_START}
      </button>

      {/* 3. Equal Visual Hierarchy Action: [완료] vs [못 함] */}
      <form
        ref={feedbackRef}
        onSubmit={handleSubmit}
        className="brutalist-box p-6 md:p-8 bg-white space-y-6"
      >
        <div>
          <h2 className="text-lg font-black text-black mb-1">
            {COPY.MEMBER.ACTION_QUESTION}
          </h2>
          <p className="text-xs font-medium text-neutral-600">
            못 하셨어도 솔직하게 남겨주시면 수업 때 강도를 조절해 드립니다.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => {
              setSelectedKind(null);
              setCompletedItemIds(items.filter((item) => (item.requirement ?? "required") === "required").map((item) => item.id));
            }}
              className={`min-h-12 rounded-xl py-4 px-3 text-center font-bold text-base border transition-all cursor-pointer ${
                completedAllRequired
                ? "bg-[var(--ui-accent)] text-white border-[var(--ui-accent)] scale-[0.98]"
                : "bg-white text-neutral-800 border-[var(--ui-border)] hover:bg-[var(--ui-accent-light)]"
            }`}
          >
            {completedAllRequired ? "✓ 필수 동작을 모두 했어요" : "필수 동작을 모두 했어요"}
          </button>

          <button
            type="button"
            onClick={() => { setSelectedKind("cant"); setCompletedItemIds([]); }}
              className={`min-h-12 rounded-xl py-4 px-3 text-center font-bold text-base border transition-all cursor-pointer ${
                selectedKind === "cant"
                ? "bg-[var(--ui-accent)] text-white border-[var(--ui-accent)] scale-[0.98]"
                : "bg-white text-neutral-800 border-[var(--ui-border)] hover:bg-[var(--ui-accent-light)]"
            }`}
          >
            {selectedKind === "cant" ? "✓ 못 했어요" : "못 했어요"}
          </button>
        </div>

        {/* Discomfort level */}
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="discomfort-level" className="text-sm font-black text-neutral-900">
              현재 느끼는 불편함 정도
            </label>
            <output htmlFor="discomfort-level" className="min-w-20 rounded-xl border border-[var(--ui-accent)] bg-[var(--ui-accent-light)] px-3 py-1 text-center font-mono text-lg font-bold text-[var(--ui-accent)]">
              {discomfortLevel} / 10
            </output>
          </div>
          <input
            id="discomfort-level"
            type="range"
            min={1}
            max={10}
            step={1}
            value={discomfortLevel}
            onChange={(event) => setDiscomfortLevel(Number(event.target.value))}
            aria-valuetext={`${discomfortLevel}점`}
            className="w-full accent-[var(--ui-accent)]"
          />
          <div className="flex justify-between text-xs font-bold text-neutral-600" aria-hidden="true">
            <span>1 낮음</span>
            <span>10 높음</span>
          </div>
          {discomfortLevel >= 8 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-neutral-800">
              불편함이 크면 무리해서 계속하지 말고, 강사에게 현재 상태를 알려주세요.
            </p>
          )}
        </div>

        {/* Feedback / Note Textarea */}
        <div>
          <label className="block text-xs font-mono font-bold mb-1 text-neutral-700">
            강사님께 남길 말 또는 느낌 (선택)
          </label>
          <textarea
            rows={2}
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder={
              selectedKind === "cant"
                ? "예: 야근 때문에 시간이 부족했어요 / 동작이 어려웠어요."
                : COPY.MEMBER.FEEDBACK_PLACEHOLDER
            }
            className="brutalist-input text-sm resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className={`w-full min-h-12 rounded-xl py-4 text-base font-bold border transition-all ${
            canSubmit
              ? "bg-[var(--ui-accent)] text-white border-[var(--ui-accent)] hover:bg-[#3d6b4b]"
              : "bg-neutral-200 text-neutral-500 cursor-not-allowed border-neutral-400"
          }`}
        >
          {submitting ? "전달 중..." : COPY.MEMBER.SUBMIT_BTN}
        </button>
      </form>
    </div>
  );
}

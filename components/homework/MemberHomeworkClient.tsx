"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Dumbbell, Loader2, Mic, Pause, Play, RotateCcw, Square, Star, Volume2, VolumeX, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { vibrate } from "@/lib/kakao-share";
import { FEEDBACK_MOODS, PAIN_AREAS, type FeedbackMood, type Homework, type HomeworkItem, type Member, type PainArea } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getExerciseMedia } from "@/lib/exercise-media";
import { createRequestId } from "@/lib/homework-assignment";
import { ordinalLabel } from "@/lib/voice-coach/phrases";
import { useVoiceCoach, type CoachDisplay } from "./useVoiceCoach";

/* ────────────────────────────────────────────────────────────
 * 1. Zod Schemas (lib/homework-schemas 에서 일원화)
 * ──────────────────────────────────────────────────────────── */

import {
  logSetInputSchema,
  submitFeedbackInputSchema,
  type LogSetInput,
  type SubmitFeedbackInput,
} from "@/lib/homework-schemas";

export { logSetInputSchema, submitFeedbackInputSchema, type LogSetInput, type SubmitFeedbackInput };

/* ────────────────────────────────────────────────────────────
 * 2. Props
 * ──────────────────────────────────────────────────────────── */

export interface MemberHomeworkClientProps {
  homework: Homework;
  member: Pick<Member, "id" | "name">;
  /** Server Action: 세트 완료 이벤트 기록 */
  onLogSet: (input: LogSetInput) => Promise<void>;
  /** Server Action: 최종 피드백 제출 (실패는 값으로 돌려받는다) */
  onSubmitFeedback: (input: SubmitFeedbackInput) => Promise<SubmitFeedbackOutcome>;
}

export type SubmitFeedbackOutcome =
  | { ok: true; alreadySubmitted: boolean }
  | { ok: false; message: string; retryable: boolean };

/* ────────────────────────────────────────────────────────────
 * 3. Hooks
 * ──────────────────────────────────────────────────────────── */

const DEFAULT_REST_SEC = 30;

type Stage = "workout" | "feedback" | "done";
type Phase = { kind: "exercise" } | { kind: "rest"; endsAt: number; durationSec: number };

interface SessionState {
  stage: Stage;
  index: number;
  /** 현재 수행할 세트(0-based) */
  setIndex: number;
  phase: Phase;
  /** 회원이 건너뛴 선택 동작 id */
  skipped: string[];
}

function sumSets(items: HomeworkItem[]): number {
  return items.reduce((acc, item) => acc + Math.max(1, item.sets ?? 1), 0);
}

/** 오프라인·일시 오류에 대비한 세트 로그 큐. 낙관적 진행 + 순차 재시도 */
function useSetLogQueue(onLogSet: (input: LogSetInput) => Promise<void>) {
  const pendingRef = useRef<LogSetInput[]>([]);
  const flushingRef = useRef<boolean>(false);
  const [hasSyncError, setHasSyncError] = useState<boolean>(false);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flushingRef.current) return pendingRef.current.length === 0;
    flushingRef.current = true;
    try {
      while (pendingRef.current.length > 0) {
        const next = pendingRef.current[0];
        if (!next) break;
        await onLogSet(next);
        pendingRef.current.shift();
      }
      setHasSyncError(false);
      return true;
    } catch {
      setHasSyncError(true);
      return false;
    } finally {
      flushingRef.current = false;
    }
  }, [onLogSet]);

  const enqueue = useCallback(
    (input: LogSetInput) => {
      const parsed = logSetInputSchema.safeParse(input);
      if (!parsed.success) return;
      pendingRef.current.push(parsed.data);
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    const handleOnline = () => {
      void flush();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [flush]);

  return { enqueue, flush, hasSyncError };
}

export function useHomeworkSession(homework: Homework, onLogSet: (input: LogSetInput) => Promise<void>) {
  const items = useMemo<HomeworkItem[]>(
    () => [...(homework.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [homework.items],
  );
  const totalSets = useMemo<number>(() => sumSets(items), [items]);

  const [state, setState] = useState<SessionState>({
    stage: items.length === 0 ? "feedback" : "workout",
    index: 0,
    setIndex: 0,
    phase: { kind: "exercise" },
    skipped: [],
  });
  const [now, setNow] = useState<number>(0);
  const { enqueue, flush, hasSyncError } = useSetLogQueue(onLogSet);

  const currentItem: HomeworkItem | null = items[state.index] ?? null;

  const completedSets = useMemo<number>(() => {
    if (state.stage !== "workout") return totalSets;
    const before = sumSets(items.slice(0, state.index));
    return before + state.setIndex;
  }, [items, state.index, state.setIndex, state.stage, totalSets]);

  const completeSet = useCallback(() => {
    if (state.stage !== "workout" || state.phase.kind !== "exercise" || !currentItem) return;

    const setsForItem = Math.max(1, currentItem.sets ?? 1);
    const setNumber = state.setIndex + 1;
    vibrate(25);

    enqueue({
      token: homework.token,
      homeworkId: homework.id,
      itemId: currentItem.id,
      setNumber,
      totalSets: setsForItem,
      completedAt: new Date().toISOString(),
    });

    if (setNumber < setsForItem) {
      const restSec = currentItem.restSec ?? 0;
      const durationSec = restSec > 0 ? restSec : DEFAULT_REST_SEC;
      const startedAt = Date.now();
      setNow(startedAt);
      setState((prev) => ({
        ...prev,
        setIndex: prev.setIndex + 1,
        phase: { kind: "rest", endsAt: startedAt + durationSec * 1000, durationSec },
      }));
      return;
    }

    if (state.index < items.length - 1) {
      setState((prev) => ({ ...prev, index: prev.index + 1, setIndex: 0, phase: { kind: "exercise" } }));
      return;
    }

    setState((prev) => ({ ...prev, stage: "feedback", phase: { kind: "exercise" } }));
  }, [currentItem, enqueue, homework.id, homework.token, items.length, state.index, state.phase.kind, state.setIndex, state.stage]);

  /** 선택(★ 없음) 동작만 건너뛸 수 있다. 필수 동작은 건너뛸 수 없다. */
  const skipItem = useCallback(() => {
    if (state.stage !== "workout" || !currentItem || currentItem.requirement !== "optional") return;
    vibrate(10);
    const skippedId = currentItem.id;
    setState((prev) => {
      const skipped = prev.skipped.includes(skippedId) ? prev.skipped : [...prev.skipped, skippedId];
      if (prev.index < items.length - 1) {
        return { ...prev, skipped, index: prev.index + 1, setIndex: 0, phase: { kind: "exercise" } };
      }
      return { ...prev, skipped, stage: "feedback", phase: { kind: "exercise" } };
    });
  }, [currentItem, items.length, state.stage]);

  const skipRest = useCallback(() => {
    vibrate(10);
    setState((prev) => (prev.phase.kind === "rest" ? { ...prev, phase: { kind: "exercise" } } : prev));
  }, []);

  const finish = useCallback(() => {
    setState((prev) => ({ ...prev, stage: "done" }));
  }, []);

  useEffect(() => {
    if (state.phase.kind !== "rest") return;
    const endsAt = state.phase.endsAt;
    const intervalId = window.setInterval(() => {
      const current = Date.now();
      if (current >= endsAt) {
        window.clearInterval(intervalId);
        vibrate([80, 60, 80]);
        setState((prev) => (prev.phase.kind === "rest" ? { ...prev, phase: { kind: "exercise" } } : prev));
        return;
      }
      setNow(current);
    }, 200);
    return () => window.clearInterval(intervalId);
  }, [state.phase]);

  const restRemainingSec =
    state.phase.kind === "rest" ? Math.max(0, Math.ceil((state.phase.endsAt - now) / 1000)) : 0;
  const restProgress =
    state.phase.kind === "rest" ? Math.min(1, Math.max(0, 1 - (state.phase.endsAt - now) / (state.phase.durationSec * 1000))) : 0;

  /** 모든 세트를 끝낸 동작 id. 서버가 이 목록으로 완료/일부/못함을 판정한다. */
  const completedItemIds = useMemo<string[]>(() => {
    const done = state.stage === "workout" ? items.slice(0, state.index) : items;
    return done.filter((item) => !state.skipped.includes(item.id)).map((item) => item.id);
  }, [items, state.index, state.skipped, state.stage]);

  /** 실제로 수행한 세트 수 (건너뛴 동작 제외). 제출 기록용 — 진행 막대는 completedSets 를 쓴다. */
  const performedSets = useMemo<number>(() => {
    const done = state.stage === "workout" ? items.slice(0, state.index) : items;
    const finished = done.filter((item) => !state.skipped.includes(item.id));
    return sumSets(finished) + (state.stage === "workout" ? state.setIndex : 0);
  }, [items, state.index, state.setIndex, state.skipped, state.stage]);

  return {
    items,
    totalSets,
    completedSets,
    performedSets,
    completedItemIds,
    skipItem,
    state,
    currentItem,
    completeSet,
    skipRest,
    finish,
    restRemainingSec,
    restProgress,
    flushLogs: flush,
    hasSyncError,
  };
}

/* ── 음성 메모: 브라우저 내장 음성 인식(Web Speech API) ──────────────
 * 서버 전송·외부 AI 호출 없이 기기에서 바로 글자로 바꾼다.
 * 지원하지 않는 환경(카카오톡 인앱 브라우저 등)은 입력창 + 키보드 마이크로 안내한다.
 * 인식 결과는 회원이 확인·수정한 뒤에만 제출된다. 고정 문구로 대체하지 않는다. */

type VoiceStatus = "idle" | "recording" | "unsupported";
type ActiveVoiceStatus = Exclude<VoiceStatus, "unsupported">;

const noopSubscribe = () => () => {};
const MAX_RECORDING_SEC = 60;
const MAX_MEMO_CHARS = 500;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

const SPEECH_ERROR_MESSAGE: Record<string, string> = {
  "not-allowed": "마이크 사용을 허용해주세요. 아래 칸에 직접 적으셔도 돼요",
  "service-not-allowed": "이 화면에서는 음성 인식을 쓸 수 없어요. 아래 칸에 적어주세요",
  "no-speech": "잘 안 들렸어요. 조금 더 크게 다시 말해주세요",
  "audio-capture": "마이크를 찾을 수 없어요. 아래 칸에 적어주세요",
  network: "음성 인식 연결이 끊겼어요. 아래 칸에 적어주세요",
};

export function useVoiceMemo() {
  // 서버 렌더에서는 "지원"으로 가정하고, 브라우저에서 실제 지원 여부로 맞춘다 (하이드레이션 안전).
  const supported = useSyncExternalStore(noopSubscribe, () => getSpeechRecognition() !== null, () => true);
  const [activeStatus, setStatus] = useState<ActiveVoiceStatus>("idle");
  const status: VoiceStatus = supported ? activeStatus : "unsupported";
  const [text, setTextState] = useState<string>("");
  const [interim, setInterim] = useState<string>("");
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const baseTextRef = useRef<string>("");

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setText = useCallback((next: string) => {
    setTextState(next.slice(0, MAX_MEMO_CHARS));
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    recognitionRef.current?.stop();
  }, [clearTimer]);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Recognition();
    } catch {
      setErrorMessage("이 화면에서는 음성 인식을 쓸 수 없어요. 아래 칸에 적어주세요");
      return;
    }
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    baseTextRef.current = text.trim();

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      const joined = [baseTextRef.current, finalText.trim()].filter(Boolean).join(" ");
      setTextState(joined.slice(0, MAX_MEMO_CHARS));
      setInterim(interimText.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      setErrorMessage(SPEECH_ERROR_MESSAGE[event.error] ?? "음성 인식이 멈췄어요. 아래 칸에 적어주셔도 돼요");
    };
    recognition.onend = () => {
      clearTimer();
      setInterim("");
      setStatus((prev) => (prev === "recording" ? "idle" : prev));
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setErrorMessage("음성 인식을 시작하지 못했어요. 아래 칸에 적어주세요");
      return;
    }
    recognitionRef.current = recognition;

    const startedAt = Date.now();
    setElapsedSec(0);
    setErrorMessage(null);
    setStatus("recording");
    vibrate(20);
    timerRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSec(seconds);
      if (seconds >= MAX_RECORDING_SEC) {
        clearTimer();
        recognitionRef.current?.stop();
      }
    }, 250);
  }, [clearTimer, text]);

  const toggle = useCallback(() => {
    if (status === "recording") {
      vibrate(15);
      stop();
      return;
    }
    if (status === "unsupported") return;
    start();
  }, [start, status, stop]);

  const reset = useCallback(() => {
    recognitionRef.current?.abort();
    clearTimer();
    setTextState("");
    setInterim("");
    setErrorMessage(null);
    setStatus("idle");
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        recognition.abort();
      }
    };
  }, [clearTimer]);

  return { status, text, interim, setText, elapsedSec, errorMessage, toggle, reset };
}

export function useFeedbackForm() {
  const [mood, setMood] = useState<FeedbackMood | null>(null);
  const [painAreas, setPainAreas] = useState<PainArea[]>([]);
  const [painScore, setPainScore] = useState<number | null>(null);

  const selectMood = useCallback((next: FeedbackMood) => {
    vibrate(15);
    setMood(next);
    if (next === "good") {
      setPainAreas([]);
      setPainScore(null);
    }
  }, []);

  const togglePainArea = useCallback((area: PainArea) => {
    vibrate(10);
    setPainAreas((prev) => {
      const next = prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area];
      if (next.length === 0) setPainScore(null);
      return next;
    });
  }, []);

  const selectPainScore = useCallback((score: number) => {
    vibrate(10);
    setPainScore(score);
  }, []);

  return { mood, painAreas, painScore, selectMood, togglePainArea, selectPainScore };
}

/* ────────────────────────────────────────────────────────────
 * 4. UI
 * ──────────────────────────────────────────────────────────── */

const MOOD_OPTIONS: ReadonlyArray<{ value: FeedbackMood; emoji: string; label: string }> = [
  { value: "good", emoji: "😃", label: "좋음" },
  { value: "hard", emoji: "😐", label: "버거움" },
  { value: "pain", emoji: "😣", label: "아픔" },
];

const PAIN_SCORES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function MemberHomeworkClient({
  homework,
  member,
  onLogSet,
  onSubmitFeedback,
}: MemberHomeworkClientProps) {
  const session = useHomeworkSession(homework, onLogSet);
  const voice = useVoiceMemo();
  // 음성 코치(숫자 구령 + "N번째 세트 시작!")는 기본 켜짐. 끄면 기존 [세트 완료] 버튼으로 진행.
  const [coachOn, setCoachOn] = useState<boolean>(true);
  const coach = useVoiceCoach({
    enabled: coachOn,
    stage: session.state.stage,
    itemIndex: session.state.index,
    setIndex: session.state.setIndex,
    item: session.currentItem,
    phaseKind: session.state.phase.kind,
    restRemainingSec: session.restRemainingSec,
    onSetComplete: session.completeSet,
  });
  // 이 화면 진입 1회당 고정 → 네트워크 재시도가 중복 제출이 되지 않는다.
  const [requestId] = useState<string>(() => createRequestId());
  const feedback = useFeedbackForm();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const progressPercent = session.totalSets > 0 ? Math.round((session.completedSets / session.totalSets) * 100) : 100;

  const handleSubmit = async () => {
    if (!feedback.mood || submitting) return;
    const parsed = submitFeedbackInputSchema.safeParse({
      token: homework.token,
      homeworkId: homework.id,
      requestId,
      completedItemIds: session.completedItemIds,
      completedSets: session.performedSets,
      totalSets: Math.max(1, session.totalSets),
      mood: feedback.mood,
      painAreas: feedback.painAreas,
      painScore: feedback.painAreas.length > 0 ? feedback.painScore : null,
      voiceMemoText: voice.text.trim() ? voice.text.trim() : null,
    });
    if (!parsed.success) {
      setSubmitError("기록을 다시 확인해주세요");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await session.flushLogs();
      const outcome = await onSubmitFeedback(parsed.data);
      if (!outcome.ok) {
        setSubmitError(outcome.message);
        return;
      }
      vibrate([40, 50, 120]);
      session.finish();
    } catch {
      setSubmitError("전송에 실패했어요. 버튼을 한 번 더 눌러주세요");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-[max(env(safe-area-inset-top),16px)] text-slate-900">
      {/* Header + progress */}
      <header className="mb-5 shrink-0">
        <p className="text-lg font-medium text-slate-500">{member.name}님의 오늘 숙제</p>
        <h1 className="mt-0.5 text-2xl font-bold leading-snug">{homework.title}</h1>
        <div
          className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div
            className="h-full origin-left rounded-full bg-[#3182F6] transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${progressPercent / 100})` }}
          />
        </div>
        <p className="mt-2 text-right text-base font-semibold tabular-nums text-slate-500">
          {session.completedSets} / {session.totalSets}세트
        </p>
        {session.state.stage === "workout" && !(coachOn && coach.display.status !== "idle") && (
          <button
            type="button"
            onClick={() => {
              if (coachOn) coach.stop();
              setCoachOn(!coachOn);
            }}
            aria-pressed={coachOn}
            className={cn(
              "mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 text-lg font-bold transition-colors active:scale-[0.98]",
              coachOn ? "border-[#3182F6] bg-[#3182F6]/[0.07] text-[#3182F6]" : "border-slate-200 text-slate-500",
            )}
          >
            {coachOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            {coachOn ? "음성 코치 켜짐 · 소리를 켜 주세요" : "음성 코치 꺼짐"}
          </button>
        )}
        {coachOn && !coach.soundSupported && session.state.stage === "workout" && (
          <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            이 기기에서는 소리 안내를 낼 수 없어요. 화면의 숫자를 보고 따라 해주세요.
          </p>
        )}
        {session.hasSyncError && (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <WifiOff className="size-4 shrink-0" />
            인터넷이 불안정해요. 기록은 자동으로 다시 보낼게요.
          </p>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {session.state.stage === "workout" && session.currentItem && (
          <motion.section
            key={`workout-${session.currentItem.id}`}
            className="flex flex-1 flex-col"
            initial={{ x: 72, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -72, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <ExerciseCard
              item={session.currentItem}
              index={session.state.index}
              total={session.items.length}
              doneSets={session.state.setIndex}
              compact={coachOn && coach.display.status !== "idle"}
            />

            <div className="mt-auto pt-6">
              <AnimatePresence mode="wait" initial={false}>
                {session.state.phase.kind === "rest" ? (
                  <motion.div
                    key="rest"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <RestCountdown
                      remainingSec={session.restRemainingSec}
                      progress={session.restProgress}
                      nextSet={session.state.setIndex + 1}
                      onSkip={session.skipRest}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key={`cta-${session.state.setIndex}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {coachOn ? (
                      coach.display.status === "idle" ? (
                        <PulseButton onPress={coach.startFromTap}>
                          {ordinalLabel(session.state.setIndex + 1)} 세트 시작
                        </PulseButton>
                      ) : (
                        <CoachPanel display={coach.display} onPause={coach.pause} onResume={coach.resume} />
                      )
                    ) : (
                      <PulseButton onPress={session.completeSet}>
                        {ctaLabel(session.currentItem, session.state.setIndex, session.state.index === session.items.length - 1)}
                      </PulseButton>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {session.currentItem.requirement === "optional" &&
                !(coachOn && coach.display.status !== "idle") && (
                  <button
                    type="button"
                    onClick={session.skipItem}
                    className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold text-slate-500 transition-colors active:bg-slate-100"
                  >
                    이 운동은 건너뛸게요
                  </button>
                )}
            </div>
          </motion.section>
        )}

        {session.state.stage === "feedback" && (
          <motion.section
            key="feedback"
            className="flex flex-1 flex-col"
            initial={{ x: 72, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -72, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <h2 className="text-[26px] font-bold leading-snug">오늘 운동, 어떠셨어요?</h2>

            <div className="mt-6 grid grid-cols-3 gap-3" role="radiogroup" aria-label="운동 후 느낌">
              {MOOD_OPTIONS.map((option) => {
                const active = feedback.mood === option.value;
                return (
                  <motion.button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => feedback.selectMood(option.value)}
                    whileTap={{ scale: 0.92 }}
                    animate={{ scale: active ? 1.04 : 1 }}
                    transition={{ type: "spring", damping: 18, stiffness: 400 }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-3xl border-2 py-5 transition-colors",
                      active ? "border-[#3182F6] bg-[#3182F6]/[0.07]" : "border-slate-200 bg-white",
                    )}
                  >
                    <span className="text-[56px] leading-none" aria-hidden>
                      {option.emoji}
                    </span>
                    <span className={cn("text-lg font-bold", active ? "text-[#3182F6]" : "text-slate-700")}>
                      {option.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {feedback.mood !== null && feedback.mood !== "good" && (
                <motion.div
                  key="pain"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <p className="mb-3 mt-7 text-xl font-bold">불편한 곳을 눌러주세요</p>
                  <div className="grid grid-cols-4 gap-2.5">
                    {PAIN_AREAS.map((area) => {
                      const active = feedback.painAreas.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          aria-pressed={active}
                          onClick={() => feedback.togglePainArea(area)}
                          className={cn(
                            "h-14 rounded-2xl border-2 text-lg font-bold transition-all duration-150 active:scale-95",
                            active ? "border-rose-500 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-700",
                          )}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>

                  {feedback.painAreas.length > 0 && (
                    <>
                      <p className="mb-3 mt-6 text-xl font-bold">얼마나 아프세요?</p>
                      <div className="grid grid-cols-6 gap-2">
                        {PAIN_SCORES.map((score) => {
                          const active = feedback.painScore === score;
                          return (
                            <button
                              key={score}
                              type="button"
                              aria-pressed={active}
                              aria-label={`${score}점`}
                              onClick={() => feedback.selectPainScore(score)}
                              className={cn(
                                "h-12 rounded-xl border-2 text-lg font-bold tabular-nums transition-all duration-150 active:scale-95",
                                active ? "border-rose-500 bg-rose-500 text-white" : "border-slate-200 text-slate-700",
                              )}
                            >
                              {score}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 flex justify-between text-sm text-slate-500">
                        <span>0 안 아픔</span>
                        <span>10 매우 아픔</span>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <VoiceMemo voice={voice} />

            <div className="mt-auto pt-8">
              {submitError && (
                <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">
                  {submitError}
                </p>
              )}
              <PulseButton onPress={handleSubmit} disabled={!feedback.mood || submitting}>
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-6 animate-spin" />
                    보내는 중…
                  </span>
                ) : feedback.mood ? (
                  "선생님께 보내기"
                ) : (
                  "느낌을 먼저 골라주세요"
                )}
              </PulseButton>
            </div>
          </motion.section>
        )}

        {session.state.stage === "done" && (
          <motion.section
            key="done"
            className="flex flex-1 flex-col items-center justify-center text-center"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 12, stiffness: 260, delay: 0.1 }}
            >
              <CheckCircle2 className="size-28 text-[#3182F6]" strokeWidth={1.6} />
            </motion.div>
            <h2 className="mt-6 text-3xl font-bold">오늘 숙제 끝!</h2>
            <p className="mt-3 text-xl leading-relaxed text-slate-600">
              수고하셨어요, {member.name}님.
              <br />
              선생님께 기록을 보냈어요.
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

function CoachPanel({
  display,
  onPause,
  onResume,
}: {
  display: CoachDisplay;
  onPause: () => void;
  onResume: () => void;
}) {
  const paused = display.status === "paused";
  const sideLabel = display.side === "left" ? "왼쪽" : display.side === "right" ? "오른쪽" : null;
  const unit = display.kind === "hold" ? "초 남음" : `/ ${display.target}`;

  return (
    <div className="flex flex-col items-center" aria-live="polite">
      {sideLabel && <p className="mb-1 text-xl font-bold text-[#3182F6]">{sideLabel}</p>}
      <div className="flex items-baseline gap-2">
        <span className="text-[80px] font-bold leading-none tabular-nums">
          {display.preparing ? "준비" : display.value}
        </span>
        {!display.preparing && <span className="text-2xl font-semibold text-slate-500">{unit}</span>}
      </div>
      <button
        type="button"
        onClick={paused ? onResume : onPause}
        className="mt-6 flex h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 text-xl font-bold text-slate-700 transition-transform duration-150 active:scale-[0.97]"
      >
        {paused ? <Play className="size-6" /> : <Pause className="size-6" />}
        {paused ? "이어서 하기" : "잠깐 멈춤"}
      </button>
    </div>
  );
}

function ctaLabel(item: HomeworkItem, setIndex: number, isLastItem: boolean): string {
  const setNumber = setIndex + 1;
  const sets = Math.max(1, item.sets ?? 1);
  if (setNumber < sets) return `${setNumber}세트 완료! 쉬기`;
  return isLastItem ? `${setNumber}세트 완료! 마무리` : `${setNumber}세트 완료! 다음 운동`;
}

function ExerciseCard({
  item,
  index,
  total,
  doneSets,
  compact = false,
}: {
  item: HomeworkItem;
  index: number;
  total: number;
  doneSets: number;
  /** 음성 코치 진행 중: 영상을 낮춰 큰 숫자가 한 화면에 보이게 한다 */
  compact?: boolean;
}) {
  const sets = Math.max(1, item.sets ?? 1);
  const amount =
    item.reps != null ? `${item.reps}회` : item.durationSec != null ? `${item.durationSec}초` : null;

  return (
    <div>
      <ExerciseMedia item={item} compact={compact} />

      <p className={cn("flex items-center gap-2 text-base font-semibold text-[#3182F6]", compact ? "mt-3" : "mt-5")}>
        운동 {index + 1} / {total}
        {item.requirement === "optional" ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-600">선택</span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-bold text-amber-700">
            <Star className="size-3.5 fill-current" />
            필수
          </span>
        )}
      </p>
      <h2 className="mt-1 text-[30px] font-bold leading-tight">{item.exerciseName}</h2>
      <p className="mt-2 text-xl font-semibold text-slate-700">
        {amount ? `${amount} × ` : ""}
        {sets}세트
      </p>
      {item.cue && !compact && <p className="mt-3 text-lg leading-relaxed text-slate-600">{item.cue}</p>}

      <div className="mt-5 flex gap-2.5" aria-label={`${sets}세트 중 ${doneSets}세트 완료`}>
        {Array.from({ length: sets }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-3 flex-1 rounded-full transition-colors duration-300",
              i < doneSets ? "bg-[#3182F6]" : i === doneSets ? "bg-[#3182F6]/30" : "bg-slate-100",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseMedia({ item, compact = false }: { item: HomeworkItem; compact?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // 동작이 바뀌면 오류 상태가 자동 초기화되도록 "어느 미디어에서 실패했는지"를 기억한다.
  const [failedSource, setFailedSource] = useState<string | null>(null);

  // item.mediaUrl이 없더라도 클라이언트에서 운동명 기반 GitHub 오픈소스 미디어 자동 폴백
  const fallbackMedia = item.mediaUrl ? null : getExerciseMedia(item.exerciseName ?? "");
  const mediaUrl = item.mediaUrl || fallbackMedia?.video || fallbackMedia?.animatedFallback || fallbackMedia?.poster;
  const mediaSourceKey = `${item.id}|${mediaUrl ?? ""}`;
  const loadError = failedSource === mediaSourceKey;
  const isVideo = Boolean(
    !loadError &&
      mediaUrl &&
      (item.mediaType === "video" || mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm"))
  );
  const isImageOrGif = Boolean(
    !loadError &&
      mediaUrl &&
      !isVideo &&
      (item.mediaType === "image" ||
        mediaUrl.endsWith(".gif") ||
        mediaUrl.endsWith(".jpg") ||
        mediaUrl.endsWith(".png") ||
        mediaUrl.endsWith(".svg") ||
        mediaUrl.includes("github") ||
        mediaUrl.includes("jsdelivr"))
  );
  const posterUrl = item.posterUrl || fallbackMedia?.poster;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    video.muted = true;
    const playPromise = video.play();
    playPromise.catch(() => {
      // 저전력 모드 등 자동재생 차단 시 안전하게 유지
    });
  }, [item.id, isVideo]);

  return (
    <div className={cn("relative w-full overflow-hidden rounded-3xl transition-all duration-300", compact ? "aspect-[16/9]" : "aspect-[4/3]",
      "flex items-center justify-center border border-slate-800 bg-slate-900/60 shadow-inner")}>
      {isVideo ? (
        <video
          key={item.id}
          ref={videoRef}
          src={mediaUrl}
          poster={posterUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          className="h-full w-full object-cover"
          aria-label={`${item.exerciseName} 동작 영상`}
          onError={() => setFailedSource(mediaSourceKey)}
        />
      ) : isImageOrGif ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item.id}
          src={mediaUrl}
          alt={`${item.exerciseName} 동작 가이드`}
          className="h-full w-full object-cover"
          loading="eager"
          onError={() => setFailedSource(mediaSourceKey)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
          <Dumbbell className="size-16 text-emerald-400/70 stroke-[1.5]" />
          <p className="text-xs font-medium text-slate-400">정확한 호흡과 코어 정렬에 집중해 주세요</p>
        </div>
      )}

      {/* GitHub 오픈소스 운동 가이드 실시간 배지 */}
      {mediaUrl && !loadError && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/70 backdrop-blur-md border border-white/10 text-[11px] font-medium text-slate-300">
          <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>동작 가이드</span>
        </div>
      )}
    </div>
  );
}

function PulseButton({
  children,
  onPress,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const [pulseKey, setPulseKey] = useState<number>(0);

  const handleClick = () => {
    if (disabled) return;
    setPulseKey((k) => k + 1);
    onPress();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", damping: 15, stiffness: 500 }}
      className="relative flex h-16 w-full items-center justify-center rounded-2xl bg-[#3182F6] text-[22px] font-bold text-white shadow-lg shadow-[#3182F6]/25 will-change-transform disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
    >
      {pulseKey > 0 && (
        <motion.span
          key={pulseKey}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-[#3182F6]"
          initial={{ scale: 1, opacity: 0.45 }}
          animate={{ scale: 1.12, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

function RestCountdown({
  remainingSec,
  progress,
  nextSet,
  onSkip,
}: {
  remainingSec: number;
  progress: number;
  nextSet: number;
  onSkip: () => void;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <div className="relative size-40">
        <svg viewBox="0 0 128 128" className="size-full -rotate-90">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="#3182F6"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * progress}
            style={{ transition: "stroke-dashoffset 200ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold tabular-nums">{remainingSec}</span>
          <span className="text-base text-slate-500">초 쉬기</span>
        </div>
      </div>
      <p className="mt-3 text-lg font-semibold text-slate-600">숨 고르고 {nextSet}세트 준비해요</p>
      <button
        type="button"
        onClick={onSkip}
        className="mt-4 h-16 w-full rounded-2xl border-2 border-slate-200 text-xl font-bold text-slate-700 transition-transform duration-150 active:scale-[0.97]"
      >
        바로 {nextSet}세트 시작
      </button>
    </div>
  );
}

function VoiceMemo({ voice }: { voice: ReturnType<typeof useVoiceMemo> }) {
  const recording = voice.status === "recording";
  const supported = voice.status !== "unsupported";

  return (
    <div className="mt-8">
      <p className="mb-3 text-xl font-bold">선생님께 하고 싶은 말 (선택)</p>

      {supported && (
        <div className="mb-3 flex items-center gap-4">
          <motion.button
            type="button"
            onClick={voice.toggle}
            whileTap={{ scale: 0.92 }}
            aria-label={recording ? "말하기 멈추기" : "말로 남기기 시작"}
            className={cn(
              "relative flex size-[88px] shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-colors",
              recording ? "bg-rose-500 shadow-rose-500/30" : "bg-slate-900 shadow-slate-900/20",
            )}
          >
            {recording && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-rose-500"
                animate={{ scale: [1, 1.25], opacity: [0.5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            {recording ? <Square className="relative size-8 fill-current" /> : <Mic className="relative size-10" />}
          </motion.button>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-800">
              {recording ? `듣고 있어요… ${voice.elapsedSec}초` : "버튼을 누르고 말씀하세요"}
            </p>
            <p className={cn("text-base", voice.errorMessage ? "text-rose-600" : "text-slate-500")}>
              {voice.errorMessage ?? (recording ? "다 말하면 한 번 더 눌러주세요" : "말한 내용이 아래 칸에 적혀요")}
            </p>
          </div>
        </div>
      )}

      <label htmlFor="voice-memo-text" className="sr-only">
        선생님께 남길 말
      </label>
      <textarea
        id="voice-memo-text"
        value={voice.interim ? `${voice.text}${voice.text ? " " : ""}${voice.interim}` : voice.text}
        onChange={(event) => voice.setText(event.target.value)}
        readOnly={recording}
        rows={3}
        maxLength={500}
        placeholder={
          supported
            ? "말한 내용을 확인하고 고칠 수 있어요"
            : "키보드의 🎤 마이크 버튼을 누르면 말로 입력할 수 있어요"
        }
        className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-lg leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#3182F6] focus:outline-none"
      />
      {voice.text && !recording && (
        <button
          type="button"
          onClick={voice.reset}
          className="mt-2 flex min-h-11 items-center gap-1.5 text-base font-semibold text-slate-500"
        >
          <RotateCcw className="size-4" />
          지우고 다시 하기
        </button>
      )}
    </div>
  );
}

export default MemberHomeworkClient;

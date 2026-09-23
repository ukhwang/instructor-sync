"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeCoachItem } from "@/lib/coach";
import type { HomeworkItem } from "@/lib/types";

type BeepKind = "start" | "tick" | "rest" | "done";
type CoachPhase = "ready" | "work" | "rest" | "prepare";
const SIDE_PREPARATION_SECONDS = 3;

function cancelSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // Speech support is optional; stopping the timer must still succeed.
  }
}

export async function resumeAudioFromGesture(ctx: AudioContext | null): Promise<boolean> {
  if (!ctx || ctx.state === "closed") return false;
  if (ctx.state === "running") return true;
  let timeout: number | undefined;
  try {
    // Some in-app browsers leave resume pending while audio is blocked.
    return await Promise.race([
      ctx.resume().then(() => ctx.state === "running"),
      new Promise<boolean>((resolve) => {
        timeout = window.setTimeout(() => resolve(false), 2000);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

function playBeep(ctx: AudioContext, kind: BeepKind) {
  const now = ctx.currentTime;
  const beep = (freq: number, when: number, dur: number, gain = 0.12) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur);
  };

  if (kind === "start") beep(880, now, 0.16, 0.14);
  else if (kind === "tick") beep(660, now, 0.05, 0.1);
  else if (kind === "rest") beep(220, now, 0.22, 0.12);
  else {
    beep(523.25, now, 0.14, 0.12);
    beep(659.25, now + 0.14, 0.14, 0.12);
    beep(783.99, now + 0.28, 0.22, 0.14);
  }
}

function speakCue(text: string, cancelPending = true) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return;
  try {
    if (cancelPending) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.trim());
    u.lang = "ko-KR";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    // TTS is optional
  }
}

const KOREAN_REP_COUNTS = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];

function speakRepCount(count: number, cancelPending = false) {
  speakCue(KOREAN_REP_COUNTS[count] ?? String(count), cancelPending);
}

export async function unlockAudioFromGesture(): Promise<AudioContext | null> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AC();
    if (!(await resumeAudioFromGesture(ctx))) return ctx;
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // continue
  }
  try {
    const u = new SpeechSynthesisUtterance("\u200b");
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch {
    // optional
  }
  return ctx;
}

interface VoiceCoachSessionProps {
  items: HomeworkItem[];
  audioCtx: AudioContext | null;
  onClose: () => void;
  onFinished: () => void;
}

export function VoiceCoachSession({
  items,
  audioCtx,
  onClose,
  onFinished,
}: VoiceCoachSessionProps) {
  const coachItems = useMemo(() => items.map(normalizeCoachItem), [items]);
  const [itemIndex, setItemIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);
  const [side, setSide] = useState<"none" | "left" | "right">("none");
  const [phase, setPhase] = useState<CoachPhase>("work");
  const [display, setDisplay] = useState(0);
  const [paused, setPaused] = useState(false);
  const [needsResume, setNeedsResume] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  const pausedRef = useRef(false);
  const resumeAttemptRef = useRef(0);
  const resumingRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(audioCtx);
  const timerRef = useRef<number | null>(null);
  const spokenItemRef = useRef<number>(-1);
  const itemIndexRef = useRef(0);
  const setIndexRef = useRef(0);
  const sideRef = useRef<"none" | "left" | "right">("none");
  const phaseRef = useRef<CoachPhase>("work");
  const displayRef = useRef(0);

  const item = coachItems[itemIndex];
  const totalSets = item?.target_sets ?? 3;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pauseSession = useCallback(() => {
    pausedRef.current = true;
    resumeAttemptRef.current += 1;
    resumingRef.current = false;
    clearTimer();
    cancelSpeech();
    setPaused(true);
    setResuming(false);
  }, [clearTimer]);

  const resumeSession = async () => {
    if (resumingRef.current) return;
    resumingRef.current = true;
    setResuming(true);
    const attempt = ++resumeAttemptRef.current;
    const audioReady = await resumeAudioFromGesture(ctxRef.current);
    // A hide, close, or finish during the await invalidates this continuation.
    if (attempt !== resumeAttemptRef.current) return;
    if (document.visibilityState === "hidden") {
      pauseSession();
      setNeedsResume(true);
      return;
    }
    resumingRef.current = false;
    pausedRef.current = false;
    setAudioUnavailable(!audioReady);
    setResuming(false);
    setNeedsResume(false);
    setPaused(false);
  };

  const beep = useCallback((kind: BeepKind) => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== "running") return;
    try {
      playBeep(ctx, kind);
    } catch {
      // visual fallback only
    }
  }, []);

  const stageWork = useCallback(
    (idx: number, setNo: number, nextSide: "none" | "left" | "right") => {
      const current = coachItems[idx];
      if (!current) return;
      itemIndexRef.current = idx;
      setIndexRef.current = setNo;
      sideRef.current = nextSide;
      phaseRef.current = "ready";
      displayRef.current = 0;
      setItemIndex(idx);
      setSetIndex(setNo);
      setSide(nextSide);
      setPhase("ready");
      setDisplay(0);
    },
    [coachItems]
  );

  const startWork = useCallback(
    (idx: number, setNo: number, nextSide: "none" | "left" | "right") => {
      const current = coachItems[idx];
      if (!current) return;
      itemIndexRef.current = idx;
      setIndexRef.current = setNo;
      sideRef.current = nextSide;
      phaseRef.current = "work";
      setItemIndex(idx);
      setSetIndex(setNo);
      setSide(nextSide);
      setPhase("work");
      const isNewItem = spokenItemRef.current !== idx;
      if (isNewItem && !pausedRef.current) {
        spokenItemRef.current = idx;
        speakCue(`${current.name}. ${current.cue}`);
      }
      if (!pausedRef.current) beep("start");
      if (current.effort_kind === "hold") {
        const secs = current.hold_seconds ?? 30;
        displayRef.current = secs;
        setDisplay(secs);
      } else {
        displayRef.current = 1;
        setDisplay(1);
        if (!pausedRef.current) speakRepCount(1, !isNewItem);
      }
    },
    [beep, coachItems]
  );

  const finishAll = useCallback(() => {
    pauseSession();
    beep("done");
    onFinished();
  }, [beep, onFinished, pauseSession]);

  const advanceAfterWork = useCallback(() => {
    const idx = itemIndexRef.current;
    const current = coachItems[idx];
    if (!current) {
      finishAll();
      return;
    }
    const setNo = setIndexRef.current;
    const perSide = Boolean(current.per_side);
    const currentSide = sideRef.current;

    if (perSide && currentSide === "left") {
      phaseRef.current = "prepare";
      sideRef.current = "right";
      displayRef.current = SIDE_PREPARATION_SECONDS;
      setPhase("prepare");
      setSide("right");
      setDisplay(SIDE_PREPARATION_SECONDS);
      speakCue("반대쪽(오른쪽) 준비하세요");
      return;
    }

    const lastSet = setNo >= (current.target_sets || 3) - 1;
    if (!lastSet) {
      const rest = current.rest_seconds ?? 20;
      if (rest === 0) {
        stageWork(idx, setNo + 1, current.per_side ? "left" : "none");
        return;
      }
      phaseRef.current = "rest";
      setPhase("rest");
      displayRef.current = rest;
      setDisplay(rest);
      beep("rest");
      speakCue(`휴식 ${rest}초입니다.`);
      return;
    }

    if (idx < coachItems.length - 1) {
      stageWork(idx + 1, 0, coachItems[idx + 1].per_side ? "left" : "none");
      return;
    }
    finishAll();
  }, [beep, coachItems, finishAll, stageWork]);

  const tick = useCallback(() => {
    if (pausedRef.current) return;
    const current = coachItems[itemIndexRef.current];
    if (!current) return;

    if (phaseRef.current !== "work") {
      const preparingSide = phaseRef.current === "prepare";
      const next = displayRef.current - 1;
      if (next <= 0) {
        const nextSet = setIndexRef.current + (preparingSide ? 0 : 1);
        const nextSide = preparingSide ? "right" : current.per_side ? "left" : "none";
        if (preparingSide) {
          startWork(itemIndexRef.current, nextSet, nextSide);
        } else {
          stageWork(itemIndexRef.current, nextSet, nextSide);
        }
        return;
      }
      displayRef.current = next;
      setDisplay(next);
      if (next <= 3) {
        beep("tick");
        // Let the side-change instruction finish during preparation.
        if (!preparingSide) speakCue(String(next));
      }
      return;
    }

    if (current.effort_kind === "hold") {
      const next = displayRef.current - 1;
      beep("tick");
      if (next <= 0) {
        advanceAfterWork();
        return;
      }
      displayRef.current = next;
      setDisplay(next);
      if (next <= 3) speakCue(String(next));
      return;
    }

    const reps = current.reps ?? 10;
    const nextRep = displayRef.current + 1;
    beep("tick");
    if (nextRep > reps) {
      advanceAfterWork();
      return;
    }
    displayRef.current = nextRep;
    setDisplay(nextRep);
    speakRepCount(nextRep);
  }, [advanceAfterWork, beep, coachItems, stageWork, startWork]);

  useEffect(() => {
    ctxRef.current = audioCtx;
  }, [audioCtx]);

  useEffect(() => {
    if (!coachItems.length) return;
    stageWork(0, 0, coachItems[0].per_side ? "left" : "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    clearTimer();
    if (paused || needsResume || resuming || phase === "ready" || !item) return;
    const current = coachItems[itemIndex];
    const delay =
      phase !== "work"
        ? 1000
        : current.effort_kind === "hold"
          ? 1000
          : Math.max(500, (current.seconds_per_rep || 3) * 1000);
    timerRef.current = window.setTimeout(tick, delay);
    return clearTimer;
  }, [paused, needsResume, resuming, item, itemIndex, setIndex, side, phase, display, tick, coachItems, clearTimer]);

  useEffect(() => {
    const onHide = (event: Event) => {
      if (event.type === "pagehide" || document.visibilityState === "hidden") {
        pauseSession();
        setNeedsResume(true);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      resumeAttemptRef.current += 1;
      resumingRef.current = false;
      clearTimer();
      cancelSpeech();
    };
  }, [clearTimer, pauseSession]);

  if (!item) return null;

  const workLabel =
    item.effort_kind === "hold"
      ? `${display}`
      : `${display} / ${item.reps ?? 10}`;
  const workUnit = item.effort_kind === "hold" ? "초" : "회";
  const sideLabel = side === "left" ? "왼쪽" : side === "right" ? "오른쪽" : null;

  const goPrev = () => {
    if (itemIndex <= 0 && setIndex <= 0) return;
    if (setIndex > 0) {
      stageWork(itemIndex, setIndex - 1, item.per_side ? "left" : "none");
      return;
    }
    const prev = coachItems[itemIndex - 1];
    stageWork(itemIndex - 1, 0, prev.per_side ? "left" : "none");
  };

  const goNext = () => {
    if (itemIndex >= coachItems.length - 1 && setIndex >= totalSets - 1) {
      finishAll();
      return;
    }
    if (setIndex < totalSets - 1) {
      stageWork(itemIndex, setIndex + 1, item.per_side ? "left" : "none");
      return;
    }
    const next = coachItems[itemIndex + 1];
    if (next) stageWork(itemIndex + 1, 0, next.per_side ? "left" : "none");
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111111] text-white flex flex-col">
      <header className="px-4 py-3 border-b-2 border-white flex items-center justify-between">
        <span className="font-mono text-xs font-black">음성 코치</span>
        <button
          type="button"
          onClick={() => {
            pauseSession();
            onClose();
          }}
          className="text-xs font-bold border-2 border-white px-3 py-1 hover:bg-white hover:text-black"
        >
          닫기
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="font-mono text-xs font-bold tracking-widest text-neutral-400">
          동작 {itemIndex + 1} / {coachItems.length} · 세트 {setIndex + 1} / {totalSets}
          {sideLabel ? ` · ${sideLabel}` : ""}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black">{item.name}</h1>
        {item.cue ? (
          <p className="text-sm font-medium text-neutral-300 max-w-md">{item.cue}</p>
        ) : null}

        <div className="mt-4">
          <div className="font-mono text-xs font-bold text-neutral-400 mb-1">
            {phase === "prepare" ? "오른쪽 준비 · 초" : phase === "rest" ? "휴식" : workUnit}
          </div>
          <div className="text-7xl sm:text-8xl font-black tabular-nums leading-none">
            {phase === "ready" ? "준비" : phase !== "work" ? display : workLabel}
          </div>
          {phase === "rest" ? (
            <div className="mt-2 text-sm font-bold text-neutral-400">다음 세트 전 휴식</div>
          ) : null}
          {phase === "prepare" ? (
            <div className="mt-2 text-sm font-bold text-neutral-400">반대쪽(오른쪽) 준비하세요</div>
          ) : null}
        </div>

        {phase === "ready" ? (
          <button
            type="button"
            onClick={() => startWork(itemIndex, setIndex, side)}
            className="w-full max-w-md min-h-16 rounded-xl bg-yellow-400 px-5 py-4 text-lg font-black text-black"
          >
            {itemIndex > 0 && setIndex === 0 ? "다음 동작 시작" : `${setIndex + 1}세트 시작`}
          </button>
        ) : null}

        {needsResume ? (
          <p className="text-xs font-bold text-yellow-300 mt-2">
            화면이 꺼졌거나 앱이 백그라운드로 갔습니다. 이어서를 누르세요.
          </p>
        ) : null}
        {audioUnavailable ? (
          <p role="status" className="text-xs font-bold text-yellow-300 mt-2">
            소리를 재개하지 못했습니다. 화면 타이머를 보며 계속 진행하세요.
          </p>
        ) : null}
      </main>

      <footer className="p-4 border-t-2 border-white grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={goPrev}
          className="py-3 font-black border-2 border-white text-sm"
        >
          이전 동작
        </button>
        <button
          type="button"
          onClick={() => {
            if (pausedRef.current) {
              void resumeSession();
              return;
            }
            pauseSession();
          }}
          disabled={resuming}
          className="py-3 font-black border-2 border-white bg-white text-black text-sm"
        >
          {resuming ? "재개 중…" : needsResume || paused ? "이어서" : "일시정지"}
        </button>
        <button
          type="button"
          onClick={goNext}
          className="py-3 font-black border-2 border-white text-sm"
        >
          다음 동작
        </button>
        <button
          type="button"
          onClick={finishAll}
          className="py-3 font-black border-2 border-yellow-400 bg-yellow-400 text-black text-sm"
        >
          끝내고 기록
        </button>
      </footer>
    </div>
  );
}

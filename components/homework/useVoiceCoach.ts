"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vibrate } from "@/lib/kakao-share";
import type { HomeworkItem } from "@/lib/types";
import {
  allDonePhrase,
  amountLabel,
  exerciseIntroPhrase,
  nativeCount,
  nextExercisePhrase,
  restStartPhrase,
} from "@/lib/voice-coach/phrases";
import { createRunner, type Runner } from "@/lib/voice-coach/runner";
import { createSpeaker, type Speaker } from "@/lib/voice-coach/speech";
import { buildSetTimeline, toSetPlan, type CoachEvent, type Side } from "@/lib/voice-coach/timeline";

export type CoachStatus = "idle" | "running" | "paused";

export interface CoachDisplay {
  status: CoachStatus;
  kind: "reps" | "hold";
  /** reps: 지금까지 센 횟수 / hold: 남은 초 */
  value: number;
  /** reps: 목표 횟수 / hold: 총 초 */
  target: number;
  side: Side;
  /** 세트 시작 구령이 나오는 중 */
  preparing: boolean;
}

export interface UseVoiceCoachInput {
  enabled: boolean;
  stage: "workout" | "feedback" | "done";
  itemIndex: number;
  setIndex: number;
  item: HomeworkItem | null;
  phaseKind: "exercise" | "rest";
  restRemainingSec: number;
  /** 한 세트의 구령이 모두 끝났을 때 (= 세트 완료) */
  onSetComplete: () => void;
}

const IDLE: CoachDisplay = { status: "idle", kind: "reps", value: 0, target: 0, side: null, preparing: false };

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}
interface WakeLockNavigator {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

export function useVoiceCoach(input: UseVoiceCoachInput) {
  const { enabled, stage, itemIndex, setIndex, item, phaseKind, restRemainingSec, onSetComplete } = input;

  const speakerRef = useRef<Speaker | null>(null);
  const runnerRef = useRef<Runner | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const autoRef = useRef<boolean>(false);
  const everStartedRef = useRef<boolean>(false);
  const onSetCompleteRef = useRef(onSetComplete);
  const [display, setDisplay] = useState<CoachDisplay>(IDLE);
  const [soundSupported, setSoundSupported] = useState<boolean>(true);

  useEffect(() => {
    onSetCompleteRef.current = onSetComplete;
  }, [onSetComplete]);

  const getSpeaker = useCallback((): Speaker => {
    if (!speakerRef.current) speakerRef.current = createSpeaker();
    return speakerRef.current;
  }, []);

  useEffect(() => {
    setSoundSupported(getSpeaker().supported);
  }, [getSpeaker]);

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) void lock.release().catch(() => {});
  }, []);

  const acquireWakeLock = useCallback(() => {
    const nav = navigator as Navigator & WakeLockNavigator;
    if (!nav.wakeLock || wakeLockRef.current) return;
    nav.wakeLock
      .request("screen")
      .then((lock) => {
        wakeLockRef.current = lock;
      })
      .catch(() => {
        // 화면 유지 실패는 무시 — 구령은 계속된다.
      });
  }, []);

  const stopRunner = useCallback(() => {
    runnerRef.current?.stop();
    runnerRef.current = null;
    getSpeaker().cancel();
    releaseWakeLock();
  }, [getSpeaker, releaseWakeLock]);

  const plan = useMemo(() => (item ? toSetPlan(item) : null), [item]);

  const startSet = useCallback(
    (fromTap: boolean) => {
      if (!item || !plan || stage !== "workout") return;
      const speaker = getSpeaker();
      // iOS/인앱: 반드시 탭 핸들러 안에서 동기적으로 오디오 잠금 해제
      if (fromTap) speaker.unlock();
      runnerRef.current?.stop();

      const setNumber = setIndex + 1;
      const intro =
        setIndex === 0
          ? exerciseIntroPhrase(
              item.exerciseName ?? item.name ?? "운동",
              plan.totalSets,
              amountLabel(plan.kind, plan.reps, plan.holdSeconds),
            )
          : null;
      const events = buildSetTimeline(plan, setNumber, { intro });
      const target = plan.kind === "hold" ? plan.holdSeconds : plan.reps;

      const handleEvent = (event: CoachEvent) => {
        if (event.speech) speaker.speak(event.speech, { interrupt: false, rate: event.kind === "count" ? 1.1 : 1 });
        if (event.kind === "count" || event.kind === "hold-tick") vibrate(12);
        setDisplay({
          status: "running",
          kind: plan.kind,
          value: event.kind === "start" || event.kind === "side-switch" ? 0 : event.value,
          target,
          side: event.side,
          preparing: event.kind === "start" || event.kind === "side-switch",
        });
        if (event.kind === "end") vibrate([40, 40, 80]);
      };

      const runner = createRunner(
        events,
        {
          onEvent: handleEvent,
          onEnd: () => {
            runnerRef.current = null;
            releaseWakeLock();
            setDisplay(IDLE);
            autoRef.current = true;
            onSetCompleteRef.current();
          },
        },
        {
          setTimeout: (fn, ms) => window.setTimeout(fn, ms),
          clearTimeout: (id) => window.clearTimeout(id),
          now: () => performance.now(),
        },
      );
      runnerRef.current = runner;
      everStartedRef.current = true;
      acquireWakeLock();
      runner.start();
    },
    [acquireWakeLock, getSpeaker, item, plan, releaseWakeLock, setIndex, stage],
  );

  /** 회원이 탭: 세트 시작 */
  const startFromTap = useCallback(() => startSet(true), [startSet]);

  const pause = useCallback(() => {
    if (!runnerRef.current) return;
    runnerRef.current.pause();
    getSpeaker().cancel();
    setDisplay((d) => ({ ...d, status: "paused" }));
  }, [getSpeaker]);

  const resume = useCallback(() => {
    if (!runnerRef.current) return;
    getSpeaker().unlock();
    runnerRef.current.resume();
    setDisplay((d) => ({ ...d, status: "running" }));
  }, [getSpeaker]);

  const prevItemRef = useRef<number>(itemIndex);

  // 휴식이 끝나 다음 세트로 돌아오면 자동으로 "N번째 세트 시작!" 구령
  const prevPhaseRef = useRef<"exercise" | "rest">(phaseKind);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phaseKind;
    // 휴식 중 선택 동작을 건너뛰면 운동(index)이 바뀐다 → 자동 시작하지 않고 회원이 직접 시작
    const sameItem = prevItemRef.current === itemIndex;
    if (prev === "rest" && phaseKind === "exercise" && enabled && autoRef.current && stage === "workout" && sameItem) {
      startSet(false);
    }
  }, [enabled, itemIndex, phaseKind, stage, startSet]);

  // 휴식 시작 안내 + 마지막 3초 카운트다운
  const restAnnouncedRef = useRef<string>("");
  useEffect(() => {
    if (!enabled || phaseKind !== "rest" || !item || stage !== "workout") return;
    const speaker = getSpeaker();
    const key = `${itemIndex}:${setIndex}`;
    if (restAnnouncedRef.current !== key) {
      restAnnouncedRef.current = key;
      speaker.speak(restStartPhrase(restRemainingSec, setIndex + 1), { interrupt: true });
      return;
    }
    if (restRemainingSec >= 1 && restRemainingSec <= 3) {
      speaker.speak(nativeCount(restRemainingSec), { interrupt: false, rate: 1.1 });
    }
  }, [enabled, getSpeaker, item, itemIndex, phaseKind, restRemainingSec, setIndex, stage]);

  // 운동이 바뀌면 자동 진행을 끊고 새 동작을 안내 (시작은 회원이 탭)
  useEffect(() => {
    if (prevItemRef.current === itemIndex) return;
    prevItemRef.current = itemIndex;
    autoRef.current = false;
    if (enabled && item && stage === "workout" && everStartedRef.current) {
      getSpeaker().speak(nextExercisePhrase(item.exerciseName ?? item.name ?? "운동"), { interrupt: true });
    }
  }, [enabled, getSpeaker, item, itemIndex, stage]);

  // 전부 끝
  const doneAnnouncedRef = useRef<boolean>(false);
  useEffect(() => {
    if (stage === "workout" || doneAnnouncedRef.current) return;
    if (enabled && everStartedRef.current) {
      doneAnnouncedRef.current = true;
      getSpeaker().speak(allDonePhrase(), { interrupt: true });
    }
  }, [enabled, getSpeaker, stage]);

  /** 음성 코치를 끌 때 호출: 진행 중인 구령을 즉시 중단 */
  const stop = useCallback(() => {
    stopRunner();
    autoRef.current = false;
    setDisplay(IDLE);
  }, [stopRunner]);

  // 앱이 백그라운드로 가면 일시정지 (소리만 계속 나는 것 방지)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [pause]);

  useEffect(() => stopRunner, [stopRunner]);

  return { display, soundSupported, startFromTap, pause, resume, stop };
}

import type { CoachEvent } from "./timeline";

/**
 * 타임라인 재생기. 시계(setTimeout/now)를 주입받아 테스트에서 가짜 시간으로 돌릴 수 있다.
 * 일시정지하면 "타임라인 안에서 어디까지 왔는지"만 기억하고, 재개하면 거기서 이어간다.
 */
export interface Clock {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
}

export interface Runner {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** 타임라인 안의 현재 위치(ms) */
  position: () => number;
}

export function createRunner(
  events: readonly CoachEvent[],
  handlers: { onEvent: (event: CoachEvent) => void; onEnd: () => void },
  clock: Clock,
): Runner {
  let index = 0;
  let offsetMs = 0;
  let startedAt = 0;
  let timer: number | null = null;
  let running = false;
  let finished = false;

  const position = () => (running ? offsetMs + (clock.now() - startedAt) : offsetMs);

  const clear = () => {
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    clear();
    if (!running || finished) return;
    const next = events[index];
    if (!next) return;
    const delay = Math.max(0, next.atMs - position());
    timer = clock.setTimeout(() => {
      timer = null;
      if (!running || finished) return;
      index += 1;
      handlers.onEvent(next);
      if (next.kind === "end" || index >= events.length) {
        finished = true;
        running = false;
        handlers.onEnd();
        return;
      }
      schedule();
    }, delay);
  };

  return {
    start() {
      if (running || finished) return;
      index = 0;
      offsetMs = 0;
      startedAt = clock.now();
      running = true;
      schedule();
    },
    pause() {
      if (!running) return;
      offsetMs = position();
      running = false;
      clear();
    },
    resume() {
      if (running || finished) return;
      startedAt = clock.now();
      running = true;
      schedule();
    },
    stop() {
      running = false;
      finished = true;
      clear();
    },
    position,
  };
}

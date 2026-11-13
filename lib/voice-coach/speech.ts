/**
 * 브라우저 음성 합성(TTS) 어댑터. 서버·외부 AI 호출 없음 (기기 내 처리, 비용 0원).
 *
 * iOS 사파리·카카오톡 인앱은 "사용자 탭 안"에서 한 번 소리를 내야 이후 타이머에서도 재생된다.
 * → 세트 시작 버튼의 클릭 핸들러에서 반드시 `unlock()` 을 동기 호출한다.
 */

export interface Speaker {
  readonly supported: boolean;
  /** 사용자 탭 핸들러 안에서 동기 호출 */
  unlock: () => void;
  /** interrupt=true 이면 말하던 중이어도 끊고 바로 읽는다 (숫자 구령용) */
  speak: (text: string, options?: { interrupt?: boolean; rate?: number }) => void;
  cancel: () => void;
}

function pickKoreanVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  const korean = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("ko"));
  return korean.find((v) => v.localService) ?? korean[0] ?? null;
}

export function createSpeaker(): Speaker {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    return { supported: false, unlock: () => {}, speak: () => {}, cancel: () => {} };
  }

  let voice: SpeechSynthesisVoice | null = null;
  const refreshVoice = () => {
    try {
      voice = pickKoreanVoice(synth);
    } catch {
      voice = null;
    }
  };
  refreshVoice();
  try {
    synth.addEventListener?.("voiceschanged", refreshVoice);
  } catch {
    // 일부 인앱 브라우저는 이벤트 미지원 — 기본 음성으로 읽는다.
  }

  return {
    supported: true,
    unlock() {
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        u.lang = "ko-KR";
        synth.speak(u);
      } catch {
        // 소리를 못 내도 화면 구령은 계속된다.
      }
    },
    speak(text, options) {
      const clean = text.trim();
      if (!clean) return;
      try {
        if (options?.interrupt ?? true) synth.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = "ko-KR";
        if (voice) u.voice = voice;
        u.rate = options?.rate ?? 1;
        u.pitch = 1;
        u.volume = 1;
        synth.speak(u);
      } catch {
        // TTS 실패는 운동을 막지 않는다.
      }
    },
    cancel() {
      try {
        synth.cancel();
      } catch {
        // noop
      }
    },
  };
}

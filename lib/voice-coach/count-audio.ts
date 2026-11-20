/**
 * 카운트 음성("하나", "둘", "셋" …) 사전 로딩·재생.
 *
 * 브라우저 음성 합성(speechSynthesis)은 호출마다 첫 음절까지 수백 ms 가 걸리고
 * 기기·인박스 브라우저마다 끊긴다. 그래서 카운트는 public/audio/counts/*.wav 를
 * 한 번 받아 AudioBuffer 로 디코딩해 두고, 카운트 순간에
 * `AudioBufferSourceNode.start(ctx.currentTime)` 으로 지연 없이 재생한다.
 *
 * 말하기 합성은 카운트 파일을 못 받은 경우(오프라인·미지원)에만 쓴다.
 */

export const COUNT_AUDIO_BASE = "/audio/counts";

/** 실제로 배치된 카운트 클립. 21 이상은 십 단위 + 일 단위를 이어 붙인다. */
export const COUNT_CLIP_NUMBERS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  30, 40, 50,
];

const CLIP_SET = new Set(COUNT_CLIP_NUMBERS.map(clipKey));

function clipKey(count: number): string {
  return String(count).padStart(2, "0");
}

/**
 * 한 숫자를 어떤 클립으로 말할지. 예) 23 → ["20", "03"] (스물 + 하나)
 * 클립이 없는 숫자(60 이상)는 null → 말하기 합성으로 폴백한다.
 */
export function countClipKeys(count: number): string[] | null {
  if (!Number.isInteger(count) || count < 1) return null;
  if (count <= 20) return [clipKey(count)];
  const tens = Math.floor(count / 10) * 10;
  const ones = count % 10;
  if (!CLIP_SET.has(clipKey(tens))) return null;
  return ones === 0 ? [clipKey(tens)] : [clipKey(tens), clipKey(ones)];
}

export function countAudioUrl(number: number): string {
  return `${COUNT_AUDIO_BASE}/${clipKey(number)}.wav`;
}

export type CountAudioBank = Map<string, AudioBuffer>;

type FetchLike = (input: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>;

function decodeAudioData(ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    // 구형 iOS Safari 는 콜백형만 지원하므로 둘 다 받는다(중복 호출은 무해).
    const maybe = ctx.decodeAudioData(bytes, resolve, reject);
    if (maybe && typeof maybe.then === "function") maybe.then(resolve, reject);
  });
}

/**
 * 카운트 클립을 모두 받아 디코딩한다. 실패한 클립은 조용히 건너뛰고
 * 호출부가 말하기 합성으로 폴백한다(오프라인·CORS·미지원).
 */
export async function loadCountAudio(
  ctx: AudioContext | null,
  options: { fetchImpl?: FetchLike | null; baseUrl?: string } = {},
): Promise<CountAudioBank> {
  const bank: CountAudioBank = new Map();
  if (!ctx || typeof ctx.decodeAudioData !== "function") return bank;
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? (fetch as unknown as FetchLike) : null);
  if (!fetchImpl) return bank;
  const base = options.baseUrl ?? COUNT_AUDIO_BASE;

  await Promise.all(
    COUNT_CLIP_NUMBERS.map(async (number) => {
      const key = clipKey(number);
      try {
        const response = await fetchImpl(`${base}/${key}.wav`);
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        const buffer = await decodeAudioData(ctx, bytes);
        if (buffer && buffer.duration > 0) bank.set(key, buffer);
      } catch {
        // 이 클립만 건너뛴다.
      }
    }),
  );

  return bank;
}

/** 두 클립을 이어 붙일 때 겹치지 않도록 살짝만 당긴다. */
const CLIP_JOIN_RATIO = 0.94;

/**
 * 카운트를 오디오 클록에 맞춰 즉시 재생한다. 준비된 버퍼가 없으면
 * 재생하지 않고 null 을 돌려주어 호출부가 폴백하게 한다.
 */
export function playCountAudio(
  ctx: AudioContext | null,
  bank: CountAudioBank,
  count: number,
  when?: number,
): AudioBufferSourceNode[] | null {
  if (!ctx || bank.size === 0) return null;
  const keys = countClipKeys(count);
  if (!keys) return null;
  const buffers: AudioBuffer[] = [];
  for (const key of keys) {
    const buffer = bank.get(key);
    if (!buffer) return null;
    buffers.push(buffer);
  }

  const startAt = when ?? ctx.currentTime;
  const sources: AudioBufferSourceNode[] = [];
  let offset = 0;
  for (const buffer of buffers) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(startAt + offset);
    sources.push(source);
    offset += buffer.duration * CLIP_JOIN_RATIO;
  }
  return sources;
}

/** 일시정지·화면 이탈 시 예약된 카운트를 끊는다. */
export function stopCountAudio(sources: AudioBufferSourceNode[] | null | undefined): void {
  if (!sources) return;
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      // 이미 끝난 소스는 무시한다.
    }
  }
  sources.length = 0;
}

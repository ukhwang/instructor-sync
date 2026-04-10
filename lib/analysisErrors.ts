/** 분석 API(HF FastAPI) 클라이언트용 사용자 메시지 */

export const ANALYZE_FETCH_TIMEOUT_MS = 120_000;

export function mapAnalyzeHttpStatus(status: number): string {
  if (status === 504 || status === 502 || status === 503) {
    return "현재 분석 서버 부하로 응답이 지연되고 있습니다. 1~2분 후 다시 시도해 주세요.";
  }
  if (status === 408 || status === 429) {
    return "요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (status >= 500) {
    return "분석 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (status === 400) {
    return "업로드한 파일 형식이나 입력값을 확인한 뒤 다시 시도해 주세요.";
  }
  return `분석 요청을 처리할 수 없습니다. (HTTP ${status})`;
}

export function mapAnalyzeNetworkError(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") {
    return "분석이 허용 시간 내에 완료되지 않았습니다. 서버가 준비 중이거나 부하가 높을 수 있으니 1~2분 후 다시 시도해 주세요.";
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
    return "네트워크 연결 또는 분석 서버에 접속할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return msg;
}

type FastAPIErrorBody = { detail?: string | Array<{ msg?: string }> };

export function parseFastAPIErrorDetailFromText(raw: string): string | undefined {
  try {
    const j = JSON.parse(raw) as FastAPIErrorBody;
    const d = j?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length > 0) {
      const parts = d.map((x) => x?.msg).filter(Boolean) as string[];
      if (parts.length) return parts.join(" ");
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function parseFastAPIErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const t = await res.text();
    return parseFastAPIErrorDetailFromText(t);
  } catch {
    return undefined;
  }
}

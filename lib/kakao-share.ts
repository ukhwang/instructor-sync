/**
 * 카카오톡 공유 유틸 (클라이언트 전용)
 * 우선순위: Kakao JS SDK(초기화된 경우) → Web Share API → 클립보드 복사
 * 어떤 경로든 링크는 먼저 클립보드에 복사해 둔다(강사가 카톡에 붙여넣기 가능).
 */

interface KakaoLink {
  mobileWebUrl: string;
  webUrl: string;
}

interface KakaoFeedSettings {
  objectType: "feed";
  content: {
    title: string;
    description: string;
    imageUrl: string;
    link: KakaoLink;
  };
  buttons?: Array<{ title: string; link: KakaoLink }>;
}

interface KakaoSDK {
  isInitialized: () => boolean;
  Share: {
    sendDefault: (settings: KakaoFeedSettings) => void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSDK;
  }
}

export type ShareResult = "kakao" | "web-share" | "clipboard" | "failed";

export interface ShareInput {
  /** 절대 URL 또는 "/h/abc" 같은 경로 */
  url: string;
  title: string;
  description: string;
  /** Kakao 피드 썸네일. 미지정 시 /og-default.png */
  imageUrl?: string;
  buttonTitle?: string;
}

export function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  return new URL(pathOrUrl, window.location.origin).toString();
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부·비보안 컨텍스트 → textarea 폴백으로 진행
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function shareToKakao(input: ShareInput): Promise<ShareResult> {
  if (typeof window === "undefined") return "failed";
  const url = toAbsoluteUrl(input.url);
  const copied = await copyToClipboard(url);

  const kakao = window.Kakao;
  if (kakao && kakao.isInitialized()) {
    try {
      const link: KakaoLink = { mobileWebUrl: url, webUrl: url };
      kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title: input.title,
          description: input.description,
          imageUrl: toAbsoluteUrl(input.imageUrl ?? "/og-default.png"),
          link,
        },
        buttons: [{ title: input.buttonTitle ?? "열어보기", link }],
      });
      return "kakao";
    } catch {
      // SDK 오류 → Web Share 폴백
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: input.title, text: input.description, url });
      return "web-share";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return copied ? "clipboard" : "failed";
      }
    }
  }

  return copied ? "clipboard" : "failed";
}

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

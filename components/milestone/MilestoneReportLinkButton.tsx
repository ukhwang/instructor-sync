"use client";

import { Check, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";

import { createMilestoneReportAction } from "@/app/actions/report";
import { copyToClipboard, toAbsoluteUrl, vibrate } from "@/lib/kakao-share";

type LinkState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "ready"; url: string; sessionNumber: number; shared: boolean }
  | { status: "error"; message: string };

/* ── Logic Hook ─────────────────────────────────────────────── */

export function useMilestoneReportLink(memberId: string, memberName: string) {
  const [state, setState] = useState<LinkState>({ status: "idle" });

  const create = async () => {
    if (state.status === "creating") return;
    vibrate(12);
    setState({ status: "creating" });
    const result = await createMilestoneReportAction({ memberId });
    if (!result.ok) {
      setState({ status: "error", message: result.message });
      return;
    }
    setState({ status: "ready", url: toAbsoluteUrl(result.path), sessionNumber: result.sessionNumber, shared: false });
  };

  // iOS Safari: 공유는 탭 직후 await 없이 호출해야 막히지 않는다 → 링크 생성과 공유를 2단계로 나눈다.
  const share = () => {
    if (state.status !== "ready") return;
    const { url, sessionNumber } = state;
    const text = `${memberName}님 ${sessionNumber}회차 운동 기록 리포트예요. 숙제하며 남겨주신 기록으로 만들었어요.\n${url}`;
    vibrate(12);
    const markShared = () => setState({ ...state, shared: true });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      navigator
        .share({ text })
        .then(markShared)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          void copyToClipboard(text).then((ok) => ok && markShared());
        });
      return;
    }
    void copyToClipboard(text).then((ok) => ok && markShared());
  };

  return { state, create, share };
}

/* ── UI ─────────────────────────────────────────────────────── */

export function MilestoneReportLinkButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { state, create, share } = useMilestoneReportLink(memberId, memberName);

  if (state.status === "ready") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={share}
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#FEE500] px-3 py-2.5 text-xs font-bold text-[#191919] active:scale-95"
        >
          {state.shared ? <Check className="size-4" /> : <MessageCircle className="size-4" />}
          {state.shared ? "보냈어요 (다시 보내기)" : "카톡으로 리포트 보내기"}
        </button>
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-1 rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2.5 text-xs font-bold active:scale-95"
        >
          <ExternalLink className="size-3.5" /> 미리보기
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void create()}
        disabled={state.status === "creating"}
        className="flex min-h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 active:scale-95"
      >
        {state.status === "creating" ? <Loader2 className="size-4 animate-spin" /> : <span aria-hidden>📊</span>}
        리포트 링크 만들기
      </button>
      {state.status === "error" && <p role="alert" className="text-xs font-semibold text-rose-600">{state.message}</p>}
    </div>
  );
}

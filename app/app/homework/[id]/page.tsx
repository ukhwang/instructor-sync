"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { getHomeworkById, revokeHomework } from "@/lib/db";
import { Homework } from "@/lib/types";
import { getSeoulDateTimeString } from "@/lib/token";
import { COPY } from "@/lib/copy";

export default function HomeworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const homeworkId = resolvedParams.id;

  const [homework, setHomework] = useState<Homework | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const hw = await getHomeworkById(homeworkId);
      setHomework(hw);
    } catch {
      setLoadError("숙제 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [homeworkId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRevoke = async () => {
    if (!confirm("정말로 이 숙제 링크를 무효화하시겠습니까? 회원이 더 이상 기록을 제출할 수 없습니다.")) {
      return;
    }
    setRevoking(true);
    try {
      await revokeHomework(homeworkId);
      await loadData();
    } finally {
      setRevoking(false);
    }
  };

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const magicUrl = homework ? `${origin}/h/${homework.token}` : "";
  const kakaoMessage = homework
    ? COPY.KAKAO.generateMessage(
        homework.member?.name || "회원",
        homework.why,
        magicUrl
      )
    : "";

  const handleCopyKakao = async () => {
    if (!kakaoMessage) return;
    await navigator.clipboard.writeText(kakaoMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="brutalist-box p-8 bg-white text-center font-bold">
        숙제 정보를 불러오는 중...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="brutalist-box p-8 bg-white text-center space-y-4">
        <p className="font-bold text-red-800">{loadError}</p>
        <button type="button" onClick={() => void loadData()} className="brutalist-btn-primary text-xs">다시 시도</button>
      </div>
    );
  }

  if (!homework) {
    return (
      <div className="brutalist-box p-8 bg-white text-center">
        <h2 className="text-xl font-black mb-3">숙제를 찾을 수 없습니다.</h2>
        <Link href="/app" className="brutalist-btn-primary text-xs">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const statusBadges: Record<string, { label: string; bg: string }> = {
    draft: { label: "초안", bg: "bg-neutral-200" },
    sent: { label: "발송됨", bg: "bg-blue-100 text-blue-900 font-bold" },
    opened: { label: "열람됨", bg: "bg-purple-100 text-purple-900 font-bold" },
    logged: { label: "기록 제출 완료", bg: "bg-green-300 text-green-950 font-black" },
    revoked: { label: "링크 무효화됨", bg: "bg-neutral-300 text-neutral-600 line-through" },
  };
  const badge = statusBadges[homework.status] || statusBadges.sent;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-neutral-600">
          <Link href="/app" className="hover:underline">
            ← 홈
          </Link>
          <span>/</span>
          {homework.member && (
            <Link
              href={`/app/members/${homework.member_id}`}
              className="hover:underline"
            >
              {homework.member.name}
            </Link>
          )}
          <span>/</span>
          <span className="text-black">숙제 상세</span>
        </div>

        <div className="flex items-center gap-2">
          {homework.member_id && (
            <Link
              href={`/app/homework/new?memberId=${encodeURIComponent(homework.member_id)}&sourceHomeworkId=${encodeURIComponent(homework.id)}`}
              className="brutalist-btn-secondary text-xs font-black"
            >
              같은 숙제 다시 내기
            </Link>
          )}
          {homework.member_id && (
            <Link
              href={`/app/session/${homework.member_id}`}
              className="brutalist-btn-yellow text-xs font-black"
            >
              수업 준비 보기 →
            </Link>
          )}
        </div>
      </div>

      {/* Main Info Box */}
      <div className="brutalist-box p-6 md:p-8 bg-white space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-black">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">
                {homework.member?.name || "회원"}님의 운동숙제
              </span>
              <span
                className={`font-mono text-xs px-2 py-0.5 border border-black ${badge.bg}`}
              >
                {badge.label}
              </span>
            </div>
            <div className="font-mono text-xs text-neutral-500 mt-1">
              생성일시: {getSeoulDateTimeString(homework.created_at)} | 만료일시:{" "}
              {getSeoulDateTimeString(homework.token_expires_at)}
            </div>
          </div>
        </div>

        {/* Why Box */}
        <div className="p-4 bg-neutral-100 border-2 border-black">
          <div className="font-mono text-xs font-black uppercase text-neutral-700 mb-1">
            이유 (Why)
          </div>
          <div className="text-lg font-black text-black">
            “{homework.why}”
          </div>
        </div>

        {/* Movement Items */}
        <div className="space-y-3">
          <h3 className="font-mono text-xs font-black uppercase tracking-wider">
            부여된 동작 목록 ({homework.items?.length || 0}개)
          </h3>
          <div className="space-y-2">
            {homework.items?.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 bg-neutral-50 border-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black bg-black text-white px-1.5 py-0.2">
                      0{idx + 1}
                    </span>
                    <span className="text-base font-black text-black">
                      {item.name}
                    </span>
                  </div>
                  {item.cue && (
                    <p className="text-xs font-medium text-neutral-700">
                      {item.cue}
                    </p>
                  )}
                </div>
                <div className="font-mono text-xs font-bold bg-white px-3 py-1 border border-black shrink-0">
                  {item.target_sets}세트 {item.target_reps}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Next Session Opening Line Preview */}
        {homework.opening_line && (
          <div className="p-4 bg-yellow-100 border-2 border-black space-y-1.5 border-l-8 border-l-yellow-400">
            <div className="font-mono text-xs font-black text-yellow-950">
              수업 시작할 때 확인할 내용
            </div>
            <p className="text-sm font-black text-black leading-relaxed">
              “{homework.opening_line}”
            </p>
          </div>
        )}

        {/* Kakao Share & Direct Link */}
        <div className="p-4 bg-neutral-50 border-2 border-black space-y-3">
          <div className="font-mono text-xs font-black">
            회원 링크 및 카톡 공유
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={magicUrl}
              className="brutalist-input text-xs font-mono flex-1 bg-white"
            />
            <button
              onClick={handleCopyKakao}
              className="brutalist-btn-yellow text-xs font-black shrink-0"
            >
              {copied ? "복사 완료!" : "카톡 문구 복사"}
            </button>
            <a
              href={magicUrl}
              target="_blank"
              rel="noreferrer"
              className="brutalist-btn-secondary text-xs shrink-0"
            >
              새 창 열기 ↗
            </a>
          </div>
        </div>

        {/* Member Logs Timeline */}
        <div className="space-y-3 pt-2">
          <h3 className="font-mono text-xs font-black uppercase tracking-wider">
            회원 제출 기록 타임라인 ({homework.logs?.length || 0}건)
          </h3>
          {homework.logs && homework.logs.length > 0 ? (
            <div className="space-y-2">
              {homework.logs.map((log) => {
                const kindLabels: Record<string, { label: string; bg: string }> = {
                  complete: { label: "완료", bg: "bg-green-300 text-green-950 font-black" },
                  partial: { label: "일부 수행", bg: "bg-amber-200 text-amber-950 font-black" },
                  cant: { label: "못 함", bg: "bg-neutral-300 text-neutral-900 font-bold" },
                  pain: { label: "통증 발생", bg: "bg-red-200 text-red-950 font-bold" },
                  note: { label: "메모", bg: "bg-blue-100 text-blue-900 font-bold" },
                };
                const kindBadge = (log.kind && kindLabels[log.kind]) || kindLabels.note;

                return (
                  <div
                    key={log.id}
                    className="p-3 bg-neutral-50 border-2 border-black space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-xs px-2 py-0.5 border border-black ${kindBadge.bg}`}
                        >
                          {kindBadge.label}
                        </span>
                        <span className="font-mono text-xs text-neutral-500">
                          {getSeoulDateTimeString(log.created_at)}
                        </span>
                      </div>
                    </div>
                    {log.payload?.note && (
                      <p className="text-sm font-bold text-black mt-1">
                        “{log.payload.note}”
                      </p>
                    )}
                    {log.kind === "partial" && log.payload?.completed_items?.length ? (
                      <p className="text-sm font-bold text-amber-900 mt-1">
                        수행했다고 답한 동작: {log.payload.completed_items
                          .map((itemId) => homework.items?.find((item) => item.id === itemId)?.name)
                          .filter(Boolean)
                          .join(", ") || `${log.payload.completed_items.length}개`}
                      </p>
                    ) : null}
                    {log.payload?.pain_area && (
                      <p className="text-sm font-bold text-red-700 mt-1">
                        통증 부위/내용: “{log.payload.pain_area}”
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs font-mono text-neutral-500 py-3 text-center border-2 border-dashed border-neutral-300">
              아직 회원이 제출한 기록이 없습니다.
            </p>
          )}
        </div>

        {/* Revoke Action */}
        {homework.status !== "revoked" && (
          <div className="pt-4 border-t-2 border-black flex justify-between items-center">
            <span className="text-xs text-neutral-600 font-medium">
              링크를 무효화하면 회원은 더 이상 이 링크로 제출할 수 없습니다.
            </span>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="text-xs font-bold text-red-600 border border-red-600 px-3 py-1.5 hover:bg-red-50"
            >
              {revoking ? "처리 중..." : "숙제 링크 무효화 (Revoke)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

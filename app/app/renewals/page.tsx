"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getMembers } from "@/lib/db";
import { Member } from "@/lib/types";
import { generateRenewalScript } from "@/lib/template";
import { COPY } from "@/lib/copy";

export default function RenewalsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Active modal for 상담 문장 보기
  const [selectedRenewalMember, setSelectedRenewalMember] = useState<{
    member: Member;
    script: { text: string };
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const allMembers = await getMembers();
      setMembers(allMembers.filter((m) => m.package_remaining <= 4));
    } catch {
      setLoadError("재등록 상담 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNextChapter = (member: Member) => {
    const script = generateRenewalScript(
      member.name,
      member.end_state,
      member.package_remaining,
      member.package_total
    );
    setSelectedRenewalMember({ member, script });
  };

  const handleCopyScript = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="brutalist-box p-8 bg-white text-center font-bold">
        재등록 카드 목록을 불러오는 중...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="brutalist-box p-8 bg-white text-center space-y-4">
        <p className="font-bold text-red-800">{loadError}</p>
        <button type="button" onClick={() => void loadData()} className="brutalist-btn-primary text-xs">
          다시 시도
        </button>
      </div>
    );
  }

  const isPro = true;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="brutalist-box p-6 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-xs font-bold text-neutral-600 mb-1">
            재등록 상담 ({members.length}명 대기)
          </div>
          <h1 className="text-2xl font-black">{COPY.RENEWALS.PAGE_TITLE}</h1>
          <p className="text-xs font-medium text-neutral-600 mt-1">
            {COPY.RENEWALS.PAGE_DESC}
          </p>
        </div>

        <Link
          href="/app/members"
          className="brutalist-btn-secondary text-xs font-bold shrink-0"
        >
          회원 목록 보기
        </Link>
      </div>

      {/* Free Plan Notice Banner */}
      {!isPro && members.length > 1 && (
        <div className="p-4 bg-yellow-100 border-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-medium text-sm">
          <div>
            <span className="font-mono text-xs font-black bg-black text-white px-2 py-0.5 mr-2">
              FREE TIER
            </span>
            {COPY.RENEWALS.PRO_LOCK_BANNER}
          </div>
        </div>
      )}

      {/* Cards List */}
      {members.length === 0 ? (
        <div className="brutalist-box p-8 bg-white text-center">
          <p className="text-base font-bold text-neutral-600 mb-2">
            현재 잔여 4회 이하인 만료 임박 회원이 없습니다.
          </p>
          <p className="text-xs text-neutral-500 font-mono">
            회원의 수업이 진행되어 잔여 횟수가 4회 이하가 되면 여기에 자동으로 카드가 생성됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {members.map((member, index) => {
            const isLocked = !isPro && index > 0;
            const script = generateRenewalScript(
              member.name,
              member.end_state,
              member.package_remaining,
              member.package_total
            );

            if (isLocked) {
              return (
                <div
                  key={member.id}
                  className="brutalist-box p-6 bg-white relative overflow-hidden"
                >
                  <div className="filter blur-sm select-none opacity-40 space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="text-lg font-black">{member.name}</div>
                      <div className="font-mono text-xs">
                        잔여 {member.package_remaining}회 / {member.package_total}회
                      </div>
                    </div>
                    <div className="p-3 bg-neutral-100">
                      회원 목표: {member.end_state}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
                    <span className="font-mono text-xs font-black bg-black text-white px-2 py-0.5 mb-2">
                      PRO 전용 잠금
                    </span>
                    <p className="text-xs font-bold text-neutral-900 mb-2">
                      두 번째 카드부터는 Pro 플랜에서 확인하실 수 있습니다.
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={member.id}
                className="brutalist-box p-6 bg-white space-y-5 border-l-8 border-l-yellow-400"
              >
                {/* Member Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-black">
                  <div>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/app/members/${member.id}`}
                        className="text-xl font-black hover:underline"
                      >
                        {member.name}
                      </Link>
                      <span className="font-mono text-xs text-neutral-600">
                        {member.phone}
                      </span>
                      <span className="font-mono text-xs font-black bg-yellow-300 text-yellow-950 px-2 py-0.5 border border-black">
                        잔여 {member.package_remaining}회 / 총 {member.package_total}회
                      </span>
                    </div>
                    <div className="text-xs font-bold text-neutral-700 mt-1">
                      <span className="font-mono text-[11px] bg-neutral-100 border border-neutral-300 px-1 mr-1.5">
                        목표
                      </span>
                      {member.end_state || "설정된 패키지 목표 없음"}
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenNextChapter(member)}
                    className="brutalist-btn-yellow text-xs font-black shrink-0"
                  >
                    {COPY.RENEWALS.CTA_OPEN_SCRIPT} →
                  </button>
                </div>

                <div className="p-4 bg-neutral-50 border-2 border-black">
                  <p className="text-sm font-medium text-neutral-900 leading-relaxed">{script.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Consultation Script Modal */}
      {selectedRenewalMember && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="brutalist-box bg-white max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div>
                <span className="font-mono text-xs font-black bg-black text-white px-2 py-0.5">
                  재등록 상담 스크립트
                </span>
                <h3 className="text-xl font-black mt-1">
                  {selectedRenewalMember.member.name}님 — 상담 문장
                </h3>
              </div>
              <button
                onClick={() => setSelectedRenewalMember(null)}
                className="font-mono text-sm font-bold px-2 py-0.5 border border-black"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-neutral-50 border-2 border-black space-y-3">
              <div className="text-xs font-mono font-bold text-neutral-600">
                강사가 수업 종료 3분 전 구어로 전달하는 스크립트:
              </div>
                  <div className="text-sm font-medium text-black leading-relaxed">
                    <p>“{selectedRenewalMember.script.text}”</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t-2 border-black">
              <span className="text-xs font-mono text-neutral-600">
                결제 연동 없이 오직 대화로 챕터를 이어갑니다.
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    handleCopyScript(
                      selectedRenewalMember.script.text
                    )
                  }
                  className="brutalist-btn-yellow text-xs font-black"
                >
                  {copied ? "✓ 스크립트 복사 완료!" : "상담 스크립트 전체 복사"}
                </button>
                <button
                  onClick={() => setSelectedRenewalMember(null)}
                  className="brutalist-btn-secondary text-xs"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  getMemberById,
  updateMember,
  getHomeworksForMember,
  getSessionNotesForMember,
  addSessionNote,
  getMemberImportRecords,
  addMemberImportRecord,
} from "@/lib/db";
import {
  Member,
  Homework,
  MemberImportRecord,
  MemberImportSourceType,
  SessionNote,
} from "@/lib/types";
import { getSeoulDateTimeString } from "@/lib/token";
import { MemberProgressPanel } from "@/components/member-progress/MemberProgressPanel";

const IMPORT_SOURCE_LABELS: Record<MemberImportSourceType, string> = {
  direct_entry: "직접 작성",
  existing_note: "기존 메모",
  conversation: "대화 기록",
  other: "기타",
};

export default function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const memberId = resolvedParams.id;

  const [member, setMember] = useState<Member | null>(null);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);
  const [importRecords, setImportRecords] = useState<MemberImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Edit Member Modal
  const [isEditing, setIsEditing] = useState(false);
  const [editRemaining, setEditRemaining] = useState(10);
  const [editEndState, setEditEndState] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState("");

  // New session note
  const [newNote, setNewNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  // Pre-existing records imported during or after onboarding
  const [showImportForm, setShowImportForm] = useState(false);
  const [importSource, setImportSource] = useState<MemberImportSourceType>("existing_note");
  const [importRawText, setImportRawText] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [importRecordedFrom, setImportRecordedFrom] = useState("");
  const [importRecordedTo, setImportRecordedTo] = useState("");
  const [importRequestId, setImportRequestId] = useState(() => crypto.randomUUID());
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [m, hwList, notes, imported] = await Promise.all([
        getMemberById(memberId),
        getHomeworksForMember(memberId),
        getSessionNotesForMember(memberId),
        getMemberImportRecords(memberId),
      ]);
      setMember(m);
      if (m) {
        setEditRemaining(m.package_remaining);
        setEditEndState(m.end_state);
        setEditPhone(m.phone);
      }
      setHomeworks(hwList);
      setSessionNotes(notes);
      setImportRecords(imported);
    } catch {
      setLoadError("회원 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;

    setEditError("");
    if (!Number.isInteger(editRemaining) || editRemaining < 0 || editRemaining > member.package_total) {
      setEditError(`잔여 횟수는 0회 이상 ${member.package_total}회 이하여야 합니다.`);
      return;
    }

    const updated = await updateMember(member.id, {
      package_remaining: Number(editRemaining),
      end_state: editEndState.trim(),
      phone: editPhone.trim(),
    });

    if (updated) {
      setMember(updated);
      setIsEditing(false);
    } else {
      setEditError("회원 정보를 저장하지 못했습니다.");
    }
  };

  const handleAddSessionNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setNoteLoading(true);
    try {
      const created = await addSessionNote(memberId, newNote.trim());
      setSessionNotes((prev) => [created, ...prev]);
      setNewNote("");
    } finally {
      setNoteLoading(false);
    }
  };

  const handleAddImportRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError("");
    if (!importRawText.trim()) {
      setImportError("옮길 기존 기록 원문을 입력해주세요.");
      return;
    }
    if (importRecordedFrom && importRecordedTo && importRecordedFrom > importRecordedTo) {
      setImportError("기록 시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    setImportLoading(true);
    try {
      const created = await addMemberImportRecord(memberId, importRequestId, {
        source_type: importSource,
        raw_text: importRawText.trim(),
        summary: importSummary.trim() || null,
        recorded_from: importRecordedFrom || null,
        recorded_to: importRecordedTo || null,
      });
      setImportRecords((prev) => [created, ...prev]);
      setImportRawText("");
      setImportSummary("");
      setImportRecordedFrom("");
      setImportRecordedTo("");
      setImportRequestId(crypto.randomUUID());
      setShowImportForm(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "기존 기록 저장에 실패했습니다.");
    } finally {
      setImportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="brutalist-box p-8 bg-white text-center font-bold">
        회원 정보를 불러오는 중...
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

  if (!member) {
    return (
      <div className="brutalist-box p-8 bg-white text-center">
        <h2 className="text-xl font-black mb-3">회원을 찾을 수 없습니다.</h2>
        <Link href="/app/members" className="brutalist-btn-primary text-xs">
          회원 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const isExpiring = member.package_remaining <= 4;

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-neutral-600">
          <Link href="/app/members" className="hover:underline">
            ← 회원 목록
          </Link>
          <span>/</span>
          <span className="text-black">{member.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/session/${member.id}`}
            className="brutalist-btn-primary min-h-11 rounded-xl text-xs font-bold"
          >
            수업 준비 열기
          </Link>
          <Link
            href={`/app/homework/new?memberId=${member.id}`}
            className="brutalist-btn-yellow min-h-11 rounded-xl text-xs font-bold"
          >
            + 새 숙제 작성
          </Link>
        </div>
      </div>

      {/* Member Info Card */}
      <div
        className={`brutalist-box p-6 bg-white space-y-4 ${
          isExpiring ? "border-l-8 border-l-yellow-400" : ""
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-black">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{member.name}</h1>
              <span className="font-mono text-sm text-neutral-600">
                {member.phone}
              </span>
              {isExpiring && (
                <span className="font-mono text-xs font-black bg-red-500 text-white px-2 py-0.5 border border-black">
                  재등록 상담 임박
                </span>
              )}
            </div>
            <div className="font-mono text-xs text-neutral-500 mt-1">
              등록일: {getSeoulDateTimeString(member.created_at)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-xs text-neutral-600 font-bold">
                패키지 현황
              </div>
              <div className="text-xl font-black">
                잔여 {member.package_remaining}회 / 총 {member.package_total}회
              </div>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs font-bold px-3 py-1.5 border-2 border-black bg-neutral-100 hover:bg-neutral-200"
            >
              정보 수정
            </button>
          </div>
        </div>

        {/* Member Goal */}
        <div className="p-4 bg-neutral-100 border-2 border-black">
          <div className="font-mono text-xs font-black uppercase text-neutral-700 mb-1">
            회원 목표
          </div>
          <div className="text-base md:text-lg font-black text-black">
            {member.end_state || "설정된 목표가 없습니다."}
          </div>
        </div>
      </div>

      {/* Edit Member Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="brutalist-box bg-white max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="text-lg font-black">회원 정보 수정</h3>
              <button
                onClick={() => setIsEditing(false)}
                className="font-mono text-sm font-bold px-2 py-0.5 border border-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateMember} className="space-y-4">
              {editError && (
                <div role="alert" className="border border-red-400 bg-red-50 p-3 text-xs font-bold text-red-800">
                  {editError}
                </div>
              )}
              <div>
                <label className="block text-xs font-mono font-black mb-1">
                  연락처
                </label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="brutalist-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-black mb-1">
                  현재 잔여 횟수
                </label>
                <input
                  type="number"
                  min={0}
                  max={member.package_total}
                  step={1}
                  required
                  value={editRemaining}
                  onChange={(e) => setEditRemaining(Number(e.target.value))}
                  className="brutalist-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-black mb-1">
                  회원 목표
                </label>
                <textarea
                  required
                  rows={2}
                  value={editEndState}
                  onChange={(e) => setEditEndState(e.target.value)}
                  className="brutalist-input text-sm resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t-2 border-black">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="brutalist-btn-secondary text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="brutalist-btn-primary text-xs font-black"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="brutalist-box p-6 bg-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
          <div>
            <h2 className="text-xl font-semibold">도입 시 가져온 기록</h2>
            <p className="text-xs font-medium text-neutral-600 mt-0.5">
              기존 기록의 원문과 요약입니다. 실제 수업 횟수나 수행률로 계산되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowImportForm((current) => !current)}
            className="brutalist-btn-secondary min-h-11 text-xs font-black"
          >
            {showImportForm ? "입력 닫기" : "+ 기존 기록 추가"}
          </button>
        </div>

        {showImportForm && (
          <form onSubmit={handleAddImportRecord} className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-[#FAFAF8] p-4">
            {importError && (
              <div role="alert" className="border border-red-400 bg-red-50 p-3 text-xs font-bold text-red-800">
                {importError}
              </div>
            )}
            <div>
              <label className="block text-xs font-black mb-1">기록 출처</label>
              <select
                value={importSource}
                onChange={(event) => setImportSource(event.target.value as MemberImportSourceType)}
                className="brutalist-input text-sm"
              >
                {Object.entries(IMPORT_SOURCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black mb-1">기존 기록 원문 *</label>
              <textarea
                required
                rows={5}
                maxLength={20000}
                value={importRawText}
                onChange={(event) => setImportRawText(event.target.value)}
                placeholder="해당 회원에게 필요한 기존 기록만 붙여넣으세요."
                className="brutalist-input text-sm resize-y"
              />
            </div>
            <div>
              <label className="block text-xs font-black mb-1">다음 수업용 요약 (선택)</label>
              <textarea
                rows={2}
                maxLength={2000}
                value={importSummary}
                onChange={(event) => setImportSummary(event.target.value)}
                className="brutalist-input text-sm resize-y"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black mb-1">기록 시작일 (선택)</label>
                <input type="date" value={importRecordedFrom} onChange={(event) => setImportRecordedFrom(event.target.value)} className="brutalist-input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black mb-1">기록 종료일 (선택)</label>
                <input type="date" value={importRecordedTo} onChange={(event) => setImportRecordedTo(event.target.value)} className="brutalist-input text-sm" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={importLoading} className="brutalist-btn-primary min-h-11 text-xs font-black">
                {importLoading ? "저장 중..." : "기존 기록 저장"}
              </button>
            </div>
          </form>
        )}

        {importRecords.length === 0 ? (
          <p className="py-4 text-center text-xs font-mono text-neutral-500">
            가져온 기존 기록이 없습니다. 필요할 때 나중에 추가할 수 있습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {importRecords.map((record) => (
              <details key={record.id} className="rounded-xl border border-[var(--ui-border)] bg-neutral-50 p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--ui-accent-light)] px-2 py-1 text-[11px] font-black text-[var(--ui-accent)]">
                          {IMPORT_SOURCE_LABELS[record.source_type]}
                        </span>
                        <span className="text-xs font-mono text-neutral-500">
                          {record.recorded_from || record.recorded_to
                            ? `${record.recorded_from || "날짜 미상"} ~ ${record.recorded_to || "날짜 미상"}`
                            : "과거 기록 · 날짜 미상"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-neutral-900">
                        {record.summary || "작성된 요약 없음 — 원문을 열어 확인하세요."}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-mono text-neutral-500">
                      가져온 시각 {getSeoulDateTimeString(record.imported_at)}
                    </span>
                  </div>
                </summary>
                <div className="mt-3 border-t border-neutral-300 pt-3">
                  <div className="mb-1 text-[11px] font-black text-neutral-600">원문</div>
                  <p className="whitespace-pre-wrap break-words text-sm text-neutral-800">{record.raw_text}</p>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <MemberProgressPanel memberId={memberId} />

      {/* Two Column Layout: Session Notes & Homework History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Session Notes (수업 메모) */}
        <div className="brutalist-box p-6 bg-white space-y-4">
          <div className="pb-3 border-b-2 border-black">
            <h2 className="text-xl font-semibold">강사 수업 메모</h2>
            <p className="text-xs font-medium text-neutral-600 mt-0.5">
              수업 중 발견한 특이사항 및 피드백을 기록합니다.
            </p>
          </div>

          <form onSubmit={handleAddSessionNote} className="space-y-2">
            <textarea
              rows={3}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="오늘 수업에서 피드백한 내용이나 다음 숙제에 참고할 점을 적어두세요."
              className="brutalist-input text-sm resize-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={noteLoading || !newNote.trim()}
                className="brutalist-btn-primary text-xs font-black"
              >
                {noteLoading ? "저장 중..." : "메모 추가"}
              </button>
            </div>
          </form>

          <div className="space-y-3 pt-2">
            {sessionNotes.length === 0 ? (
              <p className="text-xs font-mono text-neutral-500 py-4 text-center">
                작성된 수업 메모가 없습니다.
              </p>
            ) : (
              sessionNotes.map((n) => (
                <div
                  key={n.id}
                  className="p-3 bg-neutral-50 border-2 border-black space-y-1"
                >
                  <div className="text-xs font-mono text-neutral-500">
                    {getSeoulDateTimeString(n.created_at)}
                  </div>
                  <p className="text-sm font-medium text-neutral-900 whitespace-pre-wrap">
                    {n.note}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Homework History (숙제 이력) */}
        <div className="brutalist-box p-6 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b-2 border-black">
            <div>
              <h2 className="text-xl font-semibold">숙제 발송 이력</h2>
              <p className="text-xs font-medium text-neutral-600 mt-0.5">
                회원에게 전달된 숙제와 제출 상태입니다.
              </p>
            </div>
            <Link
              href={`/app/homework/new?memberId=${member.id}`}
              className="text-xs font-black px-2.5 py-1 border-2 border-black bg-yellow-400 hover:bg-yellow-300"
            >
              + 새 숙제
            </Link>
          </div>

          <div className="space-y-3">
            {homeworks.length === 0 ? (
              <p className="text-xs font-mono text-neutral-500 py-4 text-center">
                아직 발송된 숙제가 없습니다.
              </p>
            ) : (
              homeworks.map((hw) => {
                const statusBadges: Record<string, { label: string; bg: string }> = {
                  draft: { label: "초안", bg: "bg-neutral-200" },
                  sent: { label: "발송됨", bg: "bg-blue-100 text-blue-900" },
                  opened: { label: "열람됨", bg: "bg-purple-100 text-purple-900" },
                  logged: { label: "기록완료", bg: "bg-green-300 text-green-950 font-bold" },
                  revoked: { label: "무효화", bg: "bg-neutral-300 text-neutral-600" },
                };
                const badge = statusBadges[hw.status] || statusBadges.sent;

                return (
                  <div
                    key={hw.id}
                    className="p-3 bg-neutral-50 border-2 border-black space-y-2 hover:bg-neutral-100 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-neutral-500">
                        {getSeoulDateTimeString(hw.created_at)}
                      </span>
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 border border-black ${badge.bg}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-neutral-900 line-clamp-2">
                      “{hw.why}”
                    </div>

                    {hw.items && hw.items.length > 0 && (
                      <div className="flex flex-wrap gap-1 text-xs text-neutral-600">
                        {hw.items.map((it, i) => (
                          <span
                            key={i}
                            className="bg-white border border-neutral-300 px-1.5 py-0.5"
                          >
                            {it.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1 border-t border-neutral-300">
                      <Link
                        href={`/app/homework/${hw.id}`}
                        className="text-xs font-bold text-black underline hover:no-underline"
                      >
                        상세 및 로그 보기 →
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

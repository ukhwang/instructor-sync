"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getMembers, createMember, getCurrentTrainerProfile } from "@/lib/db";
import {
  Member,
  MemberImportSourceType,
  MemberRegistrationKind,
  Profile,
} from "@/lib/types";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "회원 등록에 실패했습니다.";
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Member onboarding form state
  const [memberKind, setMemberKind] = useState<MemberRegistrationKind>("new");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [packageTotal, setPackageTotal] = useState(10);
  const [packageRemaining, setPackageRemaining] = useState(10);
  const [packageExpiresOn, setPackageExpiresOn] = useState("");
  const [endState, setEndState] = useState("");
  const [importSource, setImportSource] = useState<MemberImportSourceType>("existing_note");
  const [importRawText, setImportRawText] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [importRecordedFrom, setImportRecordedFrom] = useState("");
  const [importRecordedTo, setImportRecordedTo] = useState("");
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const [membersData, profileData] = await Promise.all([
        getMembers(),
        getCurrentTrainerProfile(),
      ]);
      setMembers(membersData);
      setProfile(profileData);
    } catch {
      setErrorMsg("회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!profile?.is_pro && members.length >= 5) {
      setErrorMsg("Free 플랜은 최대 5명까지만 등록 가능합니다. 추가 등록은 도입 담당자에게 문의해주세요.");
      return;
    }

    if (!name.trim() || !phone.trim() || !endState.trim()) {
      setErrorMsg("이름, 연락처, 회원 목표는 필수 입력입니다.");
      return;
    }

    if (!Number.isInteger(packageTotal) || packageTotal < 1) {
      setErrorMsg("등록 횟수는 1회 이상의 정수로 입력해주세요.");
      return;
    }

    if (
      memberKind === "existing" &&
      (!Number.isInteger(packageRemaining) ||
        packageRemaining < 0 ||
        packageRemaining > packageTotal)
    ) {
      setErrorMsg("현재 잔여 횟수는 0회 이상, 등록 횟수 이하여야 합니다.");
      return;
    }

    if (importRecordedFrom && importRecordedTo && importRecordedFrom > importRecordedTo) {
      setErrorMsg("기존 기록의 시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    if (possibleDuplicates.length > 0 && !duplicateConfirmed) {
      setErrorMsg("기존 회원 후보를 확인하고 다른 회원인지 체크해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newMember = await createMember({
        request_id: requestId,
        member_kind: memberKind,
        name: name.trim(),
        phone: phone.trim(),
        package_total: Number(packageTotal),
        package_remaining: memberKind === "existing" ? Number(packageRemaining) : null,
        package_expires_on: packageExpiresOn || null,
        end_state: endState.trim(),
        import_record: importRawText.trim()
          ? {
              source_type: importSource,
              raw_text: importRawText.trim(),
              summary: importSummary.trim() || null,
              recorded_from: importRecordedFrom || null,
              recorded_to: importRecordedTo || null,
            }
          : null,
      });

      setMembers((prev) => [newMember, ...prev]);
      setShowAddModal(false);
      setMemberKind("new");
      setRequestId(crypto.randomUUID());
      setName("");
      setPhone("");
      setPackageTotal(10);
      setPackageRemaining(10);
      setPackageExpiresOn("");
      setEndState("");
      setImportSource("existing_note");
      setImportRawText("");
      setImportSummary("");
      setImportRecordedFrom("");
      setImportRecordedTo("");
      setDuplicateConfirmed(false);
    } catch (error) {
      setErrorMsg(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.phone.includes(searchTerm) ||
      m.end_state.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFreeLimitReached = !profile?.is_pro && members.length >= 5;
  const normalizedPhone = phone.replace(/\D/g, "");
  const possibleDuplicates = members.filter((member) => {
    const samePhone = normalizedPhone.length >= 8 && member.phone.replace(/\D/g, "") === normalizedPhone;
    const sameName = name.trim().length >= 2 && member.name.trim() === name.trim();
    return samePhone || sameName;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="brutalist-box p-6 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-xs font-bold text-neutral-600 mb-1">
            회원 관리 ({members.length}명)
          </div>
          <h1 className="text-2xl font-black">회원 목록 및 패키지 관리</h1>
          <p className="text-xs font-medium text-neutral-600 mt-1">
            회원별 패키지 잔여 횟수와 회원 목표를 관리하고 맞춤 숙제를 발송합니다.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="brutalist-btn-yellow text-sm font-black shrink-0"
        >
          + 회원 등록
        </button>
      </div>

      {/* Free Tier Limit Warning Banner */}
      {isFreeLimitReached && (
        <div className="p-4 bg-yellow-100 border-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-medium text-sm">
          <div>
            <span className="font-black bg-black text-white px-2 py-0.5 text-xs mr-2 font-mono">
              FREE LIMIT
            </span>
            Free 플랜 최대 등록 한도(5명)에 도달했습니다.
          </div>
          <div className="text-xs font-mono text-neutral-700 font-bold">
            추가 등록은 도입 담당자에게 문의해주세요.
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="회원 이름, 전화번호, 회원 목표 검색..."
          className="brutalist-input text-sm"
        />
      </div>

      {/* Member Cards / Table */}
      {loading ? (
        <div className="brutalist-box p-8 bg-white text-center font-bold">
          회원 목록을 불러오는 중...
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="brutalist-box p-8 bg-white text-center">
          <p className="text-base font-bold text-neutral-600 mb-3">
            {searchTerm ? "검색 결과가 없습니다." : "등록된 회원이 없습니다."}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="brutalist-btn-yellow text-sm font-black"
          >
            + 첫 회원 등록하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredMembers.map((member) => {
            const isExpiring = member.package_remaining <= 4;

            return (
              <div
                key={member.id}
                className={`brutalist-box p-5 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                  isExpiring ? "border-l-8 border-l-yellow-400" : ""
                }`}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/members/${member.id}`}
                      className="text-lg font-black hover:underline"
                    >
                      {member.name}
                    </Link>
                    <span className="font-mono text-xs text-neutral-600">
                      {member.phone}
                    </span>
                    <span
                      className={`font-mono text-xs font-bold px-2 py-0.5 border border-black ${
                        isExpiring
                          ? "bg-yellow-300 text-yellow-950 font-black"
                          : "bg-neutral-100 text-neutral-800"
                      }`}
                    >
                      잔여 {member.package_remaining}회 / 총 {member.package_total}회
                    </span>
                    {isExpiring && (
                      <span className="font-mono text-[11px] font-black bg-red-500 text-white px-1.5 py-0.5 border border-black">
                        재등록 상담 임박
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-bold text-neutral-800">
                    <span className="text-xs font-mono bg-neutral-200 border border-neutral-400 px-1.5 py-0.5 mr-2">
                      회원 목표
                    </span>
                    {member.end_state || "설정된 패키지 끝 상태 목표가 없습니다."}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    href={`/app/homework/new?memberId=${member.id}`}
                    className="text-xs font-black px-3 py-1.5 border-2 border-black bg-yellow-400 hover:bg-yellow-300 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5"
                  >
                    숙제 작성
                  </Link>
                  <Link
                    href={`/app/session/${member.id}`}
                    className="text-xs font-bold px-3 py-1.5 border-2 border-black bg-black text-white hover:bg-neutral-800"
                  >
                    수업 준비
                  </Link>
                  <Link
                    href={`/app/members/${member.id}`}
                    className="text-xs font-bold px-3 py-1.5 border-2 border-black bg-white hover:bg-neutral-100"
                  >
                    상세보기
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="brutalist-box bg-white max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="text-lg font-black">회원 등록</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="font-mono text-sm font-bold px-2 py-0.5 border border-black hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-100 border-2 border-black text-red-900 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateMember} className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="block text-xs font-black uppercase font-mono mb-1">
                  등록 유형
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={memberKind === "new"}
                    onClick={() => {
                      setMemberKind("new");
                      setDuplicateConfirmed(false);
                    }}
                    className={`min-h-20 rounded-xl border-2 p-3 text-left ${
                      memberKind === "new"
                        ? "border-[var(--ui-accent)] bg-[var(--ui-accent-light)]"
                        : "border-black bg-white"
                    }`}
                  >
                    <span className="block text-sm font-black">신규 수강 회원</span>
                    <span className="mt-1 block text-[11px] text-neutral-600">
                      등록 횟수만 입력하면 잔여 횟수도 같게 시작합니다.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={memberKind === "existing"}
                    onClick={() => {
                      setMemberKind("existing");
                      setDuplicateConfirmed(false);
                    }}
                    className={`min-h-20 rounded-xl border-2 p-3 text-left ${
                      memberKind === "existing"
                        ? "border-[var(--ui-accent)] bg-[var(--ui-accent-light)]"
                        : "border-black bg-white"
                    }`}
                  >
                    <span className="block text-sm font-black">기존 수강 회원 옮기기</span>
                    <span className="mt-1 block text-[11px] text-neutral-600">
                      현재 잔여 횟수와 기존 기록을 함께 가져옵니다.
                    </span>
                  </button>
                </div>
              </fieldset>

              <div>
                <label className="block text-xs font-black uppercase font-mono mb-1">
                  회원 이름 *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 김민수"
                  className="brutalist-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase font-mono mb-1">
                  연락처 (휴대폰) *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="brutalist-input text-sm"
                />
              </div>

              {possibleDuplicates.length > 0 && (
                <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs font-black">이미 등록된 회원 후보가 있습니다.</p>
                  <div className="space-y-1">
                    {possibleDuplicates.map((candidate) => (
                      <Link
                        key={candidate.id}
                        href={`/app/members/${candidate.id}`}
                        className="block text-xs font-bold underline"
                      >
                        {candidate.name} · {candidate.phone} 확인하기 →
                      </Link>
                    ))}
                  </div>
                  <label className="flex items-start gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={duplicateConfirmed}
                      onChange={(event) => setDuplicateConfirmed(event.target.checked)}
                      className="mt-0.5 size-4"
                    />
                    후보와 다른 사람임을 확인했습니다. 자동 병합하거나 패키지를 추가하지 않습니다.
                  </label>
                </div>
              )}

              <div className={`grid gap-3 ${memberKind === "existing" ? "grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <label className="block text-xs font-black uppercase font-mono mb-1">
                    {memberKind === "new" ? "등록 횟수" : "현재 이용권 등록 횟수"}
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={packageTotal}
                    onChange={(e) => setPackageTotal(Number(e.target.value))}
                    className="brutalist-input text-sm"
                  />
                </div>
                {memberKind === "existing" && (
                  <div>
                    <label className="block text-xs font-black uppercase font-mono mb-1">
                      현재 잔여 횟수
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={packageTotal}
                      step={1}
                      required
                      value={packageRemaining}
                      onChange={(e) => setPackageRemaining(Number(e.target.value))}
                      className="brutalist-input text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-black uppercase font-mono mb-1">
                  패키지 만료일 (선택)
                </label>
                <input
                  type="date"
                  value={packageExpiresOn}
                  onChange={(e) => setPackageExpiresOn(e.target.value)}
                  className="brutalist-input text-sm"
                />
              </div>

              {memberKind === "existing" && (
                <div className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-[#FAFAF8] p-4">
                  <div>
                    <h4 className="text-sm font-black">기존 기록 옮기기 <span className="font-medium text-neutral-500">(선택)</span></h4>
                    <p className="mt-1 text-[11px] text-neutral-600">
                      원문을 그대로 보관합니다. 수업 기록이나 수행률로 계산되지 않습니다.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">기록 출처</label>
                    <select
                      value={importSource}
                      onChange={(event) => setImportSource(event.target.value as MemberImportSourceType)}
                      className="brutalist-input text-sm"
                    >
                      <option value="existing_note">기존 메모</option>
                      <option value="conversation">대화 기록</option>
                      <option value="direct_entry">직접 작성</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">기존 기록 원문</label>
                    <textarea
                      rows={5}
                      maxLength={20000}
                      value={importRawText}
                      onChange={(event) => setImportRawText(event.target.value)}
                      placeholder="카카오톡, 메모장, 노션 등의 필요한 기록만 붙여넣으세요."
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
                      placeholder="최근 운동, 주의점, 다음에 확인할 내용을 짧게 적어주세요."
                      className="brutalist-input text-sm resize-y"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black mb-1">기록 시작일 (선택)</label>
                      <input
                        type="date"
                        value={importRecordedFrom}
                        onChange={(event) => setImportRecordedFrom(event.target.value)}
                        className="brutalist-input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black mb-1">기록 종료일 (선택)</label>
                      <input
                        type="date"
                        value={importRecordedTo}
                        onChange={(event) => setImportRecordedTo(event.target.value)}
                        className="brutalist-input text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black uppercase font-mono mb-1">
                  회원 목표 한 줄 *
                </label>
                <p className="text-[11px] text-neutral-600 mb-1 font-medium">
                  이 패키지가 끝날 때 회원이 도달할 구체적인 몸의 상태를 씁니다.
                </p>
                <input
                  type="text"
                  required
                  value={endState}
                  onChange={(e) => setEndState(e.target.value)}
                  placeholder="예: 허리 통증 없이 데드리프트 80kg 자율 수행"
                  className="brutalist-input text-sm"
                />
              </div>

              <div className="pt-3 border-t-2 border-black flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="brutalist-btn-secondary text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="brutalist-btn-primary text-xs font-black"
                >
                  {isSubmitting ? "저장 중..." : "회원 등록 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

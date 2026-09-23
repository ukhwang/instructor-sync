"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getMembers, createHomework, getHomeworkById } from "@/lib/db";
import { Member } from "@/lib/types";
import { createExerciseCatalog, seedRecords } from "@/lib/exercises/catalog";
import { loadExerciseRecords } from "@/lib/exercises/provider";
import { generateCryptoToken, get14DaysExpiryISO } from "@/lib/token";
import { COPY } from "@/lib/copy";
import { useHomeworkDraftStore } from "@/stores/homework-draft-store";
import { ExercisePicker } from "@/components/exercises/ExercisePicker";
import { generateHomeworkWhy } from "@/lib/homework-why";
import { calculateHomeworkVolume } from "@/lib/homework-volume";
import { burdenMinutesToSeconds, createRequestId, hasRequiredItem, loadInFlightAssignment, saveInFlightAssignment, clearInFlightAssignment, type InFlightAssignment } from "@/lib/homework-assignment";

function HomeworkNewContent() {
  const searchParams = useSearchParams();
  const initialMemberId = searchParams.get("memberId") || "";
  const initialExercise = searchParams.get("exercise") || "";
  const initialExerciseId = searchParams.get("exerciseId") || "";
  const initialGoal = searchParams.get("goal") || "";
  const initialSourceHomeworkId = searchParams.get("sourceHomeworkId") || "";

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Seed exercise picker modal/drawer
  const [showSeedPicker, setShowSeedPicker] = useState(false);

  // Created homework success state
  const [createdHw, setCreatedHw] = useState<{
    id: string;
    token: string;
    url: string;
    kakaoMessage: string;
    memberName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Zustand draft store
  const {
    memberId,
    why,
    whyEdited,
    purpose,
    sessionGoal,
    burdenBudgetMinutes,
    setPurpose,
    setSessionGoal,
    setBurdenBudgetMinutes,
    setGeneratedWhy,
    hydrateDraft,
    items,
    setMemberId,
    setWhy,
    addItem,
    addSeedItem,
    removeItem,
    updateItem,
    resetDraft,
  } = useHomeworkDraftStore();
  const inFlightRef = useRef<InFlightAssignment | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getMembers(),
      loadExerciseRecords().catch(() => seedRecords),
      initialSourceHomeworkId ? getHomeworkById(initialSourceHomeworkId) : Promise.resolve(null),
    ]).then(([data, exercises, sourceHomework]) => {
      if (cancelled) return;
      setMembers(data);
      if (sourceHomework && sourceHomework.member_id && !useHomeworkDraftStore.getState().why) {
        hydrateDraft({
          memberId: sourceHomework.member_id,
          why: sourceHomework.why,
          purpose: sourceHomework.assignment_purpose ?? 'review',
          burdenBudgetMinutes: sourceHomework.burden_budget_seconds
            ? String(sourceHomework.burden_budget_seconds / 60)
            : '',
          sessionGoal: '',
          items: (sourceHomework.items || []).map((item) => ({
            exercise_snapshot: item.exercise_snapshot,
            name: item.name,
            cue: item.cue,
            target_sets: item.target_sets,
            target_reps: item.target_reps,
            effort_kind: item.effort_kind,
            reps: item.reps,
            hold_seconds: item.hold_seconds,
            seconds_per_rep: item.seconds_per_rep,
            rest_seconds: item.rest_seconds,
            per_side: item.per_side,
            requirement: item.requirement ?? 'required',
          })),
        });
      }
      const draft = useHomeworkDraftStore.getState();
      const sessionSeed = initialExerciseId
        ? createExerciseCatalog(exercises).getById(initialExerciseId)
        : exercises.find((seed) => seed.name === initialExercise);

      if (initialMemberId && sessionSeed) {
        if (draft.memberId && draft.memberId !== initialMemberId) {
          resetDraft();
        }
        setMemberId(initialMemberId);
        setSessionGoal(initialGoal);

        const currentItems = useHomeworkDraftStore.getState().items;
        if (!currentItems.some((item) => item.name === sessionSeed.name)) {
          addSeedItem(sessionSeed);
        }
      } else if (initialMemberId && !draft.memberId) {
        setMemberId(initialMemberId);
      } else if (data.length > 0 && !draft.memberId) {
        setMemberId(data[0].id);
      }
      setLoading(false);
    }).catch(() => { if (!cancelled) { setErrorMsg('회원 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [addSeedItem, hydrateDraft, initialExercise, initialExerciseId, initialGoal, initialMemberId, initialSourceHomeworkId, resetDraft, setMemberId, setSessionGoal]);

  const selectedMember = members.find((m) => m.id === memberId);
  const homeworkVolume = calculateHomeworkVolume(items);

  useEffect(() => {
    if (!whyEdited && purpose !== "custom") {
      const generated = generateHomeworkWhy(items, purpose, sessionGoal);
      if (generated !== why) setGeneratedWhy(generated);
    }
  }, [items, purpose, sessionGoal, why, whyEdited, setGeneratedWhy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!memberId) {
      setErrorMsg("회원을 선택해주세요.");
      return;
    }

    if (!why.trim()) {
      setErrorMsg("회원에게 보낼 숙제 안내를 입력해 주세요.");
      return;
    }

    const validItems = items.filter((item) => item.name.trim().length > 0);
    if (validItems.length === 0) {
      setErrorMsg("최소 1개 이상의 운동 동작을 입력해주세요.");
      return;
    }

    if (validItems.length > 3) {
      setErrorMsg("운동 동작은 최대 3개까지만 등록 가능합니다.");
      return;
    }

    if (!hasRequiredItem(validItems)) {
      setErrorMsg("최소 1개 이상의 필수 동작을 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const assignmentItems = validItems.map((it, idx) => ({
        order_index: idx + 1,
        exercise_snapshot: it.exercise_snapshot,
        name: it.name.trim(),
        cue: it.cue.trim(),
        target_sets: Number(it.target_sets) || 3,
        target_reps: it.target_reps.trim() || "10회",
        effort_kind: it.effort_kind,
        reps: it.reps,
        hold_seconds: it.hold_seconds,
        seconds_per_rep: it.seconds_per_rep,
        rest_seconds: it.rest_seconds,
        per_side: it.per_side,
        requirement: it.requirement ?? 'required',
      }));
      const burden_budget_seconds = burdenMinutesToSeconds(burdenBudgetMinutes);
      if (burdenBudgetMinutes.trim() && burden_budget_seconds === null) {
        setErrorMsg("하루 운동 부담 상한은 0보다 큰 분 단위 숫자로 입력해주세요.");
        setSubmitting(false);
        return;
      }
      const fingerprint = JSON.stringify({ memberId, why: why.trim(), purpose, burden_budget_seconds, items: assignmentItems });
      const current = inFlightRef.current?.fingerprint === fingerprint
        ? inFlightRef.current
        : loadInFlightAssignment(fingerprint) ?? {
        fingerprint,
        request_id: createRequestId(),
        token: generateCryptoToken(24),
        token_expires_at: get14DaysExpiryISO(),
      };
      inFlightRef.current = current;
      saveInFlightAssignment(current);

      const newHw = await createHomework({
        request_id: current.request_id,
        member_id: memberId,
        why: why.trim(),
        token: current.token,
        token_expires_at: current.token_expires_at,
        assignment_purpose: purpose === 'custom' ? null : purpose,
        burden_budget_seconds,
        source_homework_id: initialSourceHomeworkId || null,
        items: assignmentItems,
      });

      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const magicUrl = `${origin}/h/${current.token}`;
      const memberName = selectedMember?.name || "회원";
      const kakaoMsg = COPY.KAKAO.generateMessage(memberName, why.trim(), magicUrl);

      setCreatedHw({
        id: newHw.id,
        token: current.token,
        url: magicUrl,
        kakaoMessage: kakaoMsg,
        memberName,
      });

      resetDraft();
      inFlightRef.current = null;
      clearInFlightAssignment(fingerprint);
    } catch {
      setErrorMsg("숙제 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyKakao = async () => {
    if (!createdHw) return;
    try {
      await navigator.clipboard.writeText(createdHw.kakaoMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  if (loading) {
    return (
      <div className="brutalist-box p-8 bg-white text-center font-bold">
        데이터를 준비하는 중...
      </div>
    );
  }

  // If created, display instant Kakao message copy box
  if (createdHw) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="brutalist-box p-6 md:p-8 bg-white space-y-6 border-l-8 border-l-yellow-400">
          <div>
            <div className="font-mono text-xs font-black bg-yellow-300 text-black px-2 py-0.5 inline-block border border-black mb-2">
              숙제 링크 생성 완료
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {createdHw.memberName}님의 숙제가 생성되었습니다.
            </h1>
            <p className="text-sm font-bold text-neutral-700 mt-1">
              아래 버튼을 눌러 카카오톡에 그대로 붙여넣으세요. (자동발송 없음)
            </p>
          </div>

          {/* Formatted Message Box */}
          <div className="p-4 bg-neutral-100 border-2 border-black space-y-2">
            <div className="font-mono text-xs font-bold text-neutral-600 flex justify-between">
              <span>카카오톡 전송 문구</span>
              <span>로그인 불필요 매직링크</span>
            </div>
            <pre className="text-xs md:text-sm font-sans font-medium text-neutral-900 whitespace-pre-wrap leading-relaxed">
              {createdHw.kakaoMessage}
            </pre>
          </div>

          {/* Copy Button */}
          <div className="space-y-3">
            <button
              onClick={handleCopyKakao}
              className={`w-full min-h-12 rounded-xl py-3.5 text-base font-bold border transition-all ${
                copied
                  ? "bg-[var(--ui-accent-light)] text-[var(--ui-accent)] border-[var(--ui-accent)]"
                  : "bg-[var(--ui-accent)] text-white border-[var(--ui-accent)] hover:bg-[#3d6b4b]"
              }`}
            >
              {copied
                ? "✓ 카카오톡 문구 + 링크 복사 완료!"
                : "카카오톡 문구 + 링크 복사하기 (클릭)"}
            </button>

            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={createdHw.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 brutalist-btn-secondary text-xs text-center font-bold"
              >
                회원 화면 직접 확인하기 (새 창) ↗
              </a>
              <Link
                href={`/app/session/${memberId || initialMemberId}`}
                className="flex-1 brutalist-btn-primary text-xs text-center font-black"
              >
                수업 준비로 이동 →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="brutalist-box p-6 bg-white flex items-center justify-between">
        <div>
          <div className="font-mono text-xs font-bold text-neutral-600 mb-1">
            새 숙제 작성
          </div>
          <h1 className="text-2xl font-bold tracking-tight">오늘의 운동숙제</h1>
          <p className="text-xs font-medium text-neutral-600 mt-1">
            회원에게 필요한 1~3가지 동작과 Why 한 줄을 적고 링크를 복사하세요.
          </p>
        </div>
        <Link href="/app" className="brutalist-btn-secondary text-xs font-bold">
          취소
        </Link>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-100 border-2 border-black text-red-900 text-xs font-bold">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="px-1 text-xs font-bold text-neutral-600">
          <span className="text-red-600">*</span> 표시는 필수 입력입니다. 코칭 큐는 회원에게 전달할 때만 선택해서 적을 수 있습니다.
        </p>

        {/* Step 1: Member Select */}
        <div className="brutalist-box p-6 bg-white space-y-3">
          <label className="block text-sm font-black uppercase font-mono">
            1. 대상 회원 선택 *
          </label>
          {members.length === 0 ? (
            <div className="text-sm font-medium text-red-600">
              등록된 회원이 없습니다. 먼저{" "}
              <Link href="/app/members" className="underline font-bold">
                회원 등록
              </Link>
              을 해주세요.
            </div>
          ) : (
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="brutalist-input text-sm font-bold"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.phone}) — 잔여 {m.package_remaining}회 / {m.end_state || "목표 미입력"}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Step 2: Movement Items (1~3 items) */}
        <div className="brutalist-box p-6 bg-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b-2 border-black">
            <div>
              <label className="block text-sm font-black uppercase font-mono">
                2. 운동 동작 (1~3가지) *
              </label>
              <p className="text-xs font-medium text-neutral-600">
                수업 때 진행한 큐(Cue)와 목표 세트/횟수를 적습니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSeedPicker(true)}
                className="min-h-11 rounded-xl text-xs font-bold px-3 py-1.5 border border-[var(--ui-accent)] bg-[var(--ui-accent-light)] text-[var(--ui-accent)] hover:bg-[#d8e6dc]"
              >
                + 운동 검색해서 추가
              </button>
              {items.length < 3 && (
                <button
                  type="button"
                  onClick={() =>
                    addItem({
                      name: "",
                      cue: "",
                      target_sets: 3,
                      target_reps: "10회",
                    })
                  }
                  className="min-h-11 rounded-xl text-xs font-bold px-3 py-1.5 border border-[var(--ui-border)] bg-white hover:bg-neutral-50"
                >
                  + 직접 추가
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={item.id || index}
                className="p-4 bg-neutral-50 border border-[var(--ui-border)] rounded-xl space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black bg-black text-white px-2 py-0.5">
                    동작 0{index + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-xs font-bold text-red-600 hover:text-red-800 underline"
                    >
                      삭제
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono font-bold mb-1">
                      동작명 *
                    </label>
                    <input
                      type="text"
                      required
                      value={item.name}
                      onChange={(e) =>
                        updateItem(index, { name: e.target.value })
                      }
                      placeholder="예: 글루트 브릿지"
                      className="brutalist-input text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                    <label className="block text-xs font-mono font-bold mb-1">
                      세트 <span className="text-red-600">*</span>
                      </label>
                      <input
                      type="number"
                      min={1}
                      required
                        value={item.target_sets}
                        onChange={(e) =>
                          updateItem(index, {
                            target_sets: Number(e.target.value),
                          })
                        }
                        className="brutalist-input text-sm"
                      />
                    </div>
                    <div>
                    <label className="block text-xs font-mono font-bold mb-1">
                      목표 횟수/시간 <span className="text-red-600">*</span>
                      </label>
                      <input
                      type="text"
                      required
                        value={item.target_reps}
                        onChange={(e) =>
                          updateItem(index, { target_reps: e.target.value })
                        }
                        placeholder="예: 15회 / 30초"
                        className="brutalist-input text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold mb-1">
                    코칭 큐 <span className="font-medium text-neutral-500">(선택)</span>
                  </label>
                  <input
                    type="text"
                    value={item.cue}
                    onChange={(e) => updateItem(index, { cue: e.target.value })}
                    placeholder="예: 골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다."
                    className="brutalist-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold mb-1">이 동작의 요구 수준</label>
                  <select
                    value={item.requirement ?? 'required'}
                    onChange={(e) => updateItem(index, { requirement: e.target.value as 'required' | 'optional' })}
                    className="brutalist-input text-sm font-bold"
                  >
                    <option value="required">필수 동작</option>
                    <option value="optional">선택 동작</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="border-2 border-[var(--ui-accent)] bg-[var(--ui-accent-light)] p-4 space-y-2" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black">예상 총량</p>
              <p className="text-xs font-bold text-neutral-600">휴식 시간 제외 · 입력 중 자동 계산</p>
            </div>
            {homeworkVolume.exerciseCount === 0 ? (
              <p className="text-sm font-medium text-neutral-700">동작명을 입력하면 세트와 횟수/시간을 합산해 보여드립니다.</p>
            ) : (
              <>
                <p className="text-lg font-black">
                  {homeworkVolume.totalSets}세트
                  {homeworkVolume.totalReps > 0 && ` · ${homeworkVolume.totalReps}회`}
                  {homeworkVolume.totalHoldSeconds > 0 && ` · ${homeworkVolume.totalHoldSeconds}초`}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-neutral-700">
                  {homeworkVolume.perItem.map((item) => (
                    <span key={`${item.name}-${item.sets}`}>
                      {item.name} {item.sets}세트
                      {item.reps > 0 && ` × ${item.reps}회${item.perSide ? " (좌우 포함)" : ""}`}
                      {item.holdSeconds > 0 && ` × ${item.holdSeconds}초${item.perSide ? " (좌우 포함)" : ""}`}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Step 3: Mandatory 'Why' */}
        <div className="brutalist-box p-6 bg-white space-y-2 border-l-8 border-l-black">
          <label className="block text-sm font-black uppercase font-mono">
            3. 이번 숙제 안내 <span className="text-red-600">*</span>
          </label>
          <p className="text-xs font-medium text-neutral-600">
            운동과 목적을 고르면 초안이 만들어집니다. 회원에게 맞게 자유롭게 고쳐 쓰세요.
          </p>
          <div className="flex flex-wrap gap-2 pt-1" aria-label="숙제 목적">
            {([['routine', '기본 루틴'], ['focus', '이번 주 집중'], ['review', '수업 복습']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={purpose === value} onClick={() => setPurpose(value)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${purpose === value ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-light)] text-[var(--ui-accent)]' : 'border-[var(--ui-border)] bg-white'}`}>{label}</button>
            ))}
          </div>
          <div className="border-t border-[var(--ui-border)] pt-3 space-y-1">
            <label className="block text-xs font-mono font-bold" htmlFor="burden-budget">하루 운동 부담 상한 <span className="font-medium text-neutral-500">(선택, 분)</span></label>
            <input id="burden-budget" type="number" min={1} step={1} inputMode="numeric" value={burdenBudgetMinutes} onChange={(e) => setBurdenBudgetMinutes(e.target.value)} placeholder="예: 15" className="brutalist-input text-sm" />
            <p className="text-xs text-neutral-600">입력한 분 단위 예산은 저장 시 초 단위로 변환됩니다.</p>
          </div>
          <textarea
            required
            rows={3}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="운동과 목적을 선택하면 안내 문장이 자동으로 채워집니다."
            className="brutalist-input text-sm font-bold resize-none"
          />
          {whyEdited && <p className="text-xs text-neutral-600">직접 수정한 안내는 운동이나 목적을 바꿔도 유지됩니다.</p>}
          {whyEdited && purpose !== 'custom' && <details className="text-sm"><summary className="cursor-pointer">현재 선택으로 만든 안내 초안 보기</summary><p className="py-2 whitespace-pre-wrap">{generateHomeworkWhy(items, purpose, sessionGoal)}</p></details>}
        </div>

        {/* Submit */}
        <div className="sticky bottom-3 z-10 rounded-2xl border border-[var(--ui-border)] bg-white/95 p-2 shadow-[0_8px_24px_rgba(23,23,23,0.10)] backdrop-blur">
          <button
            type="submit"
            disabled={submitting}
            className="w-full brutalist-btn-yellow min-h-12 py-4 text-base md:text-lg font-bold"
          >
            {submitting ? "링크 생성 중..." : "숙제 링크 생성 및 카톡 문구 복사하기 →"}
          </button>
        </div>
      </form>

      {/* Shared exercise catalog picker */}
      {showSeedPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="brutalist-box bg-white max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black shrink-0">
              <div>
                <h3 className="text-lg font-black">운동 검색</h3>
                <p className="text-xs font-medium text-neutral-600">
                  클릭 시 숙제 동작 목록에 바로 추가됩니다 (최대 3개).
                </p>
              </div>
              <button
                onClick={() => setShowSeedPicker(false)}
                className="font-mono text-sm font-bold px-2 py-0.5 border border-black"
              >
                ✕
              </button>
            </div>

            {/* Category Tabs */}
            <ExercisePicker
              value={items.filter((item) => item.name).map((item) => item.name).join(", ")}
              onSelect={(selected) => {
                const ok = addSeedItem(selected);
                if (!ok) alert("운동 동작은 최대 3개까지만 추가할 수 있습니다.");
              }}
              label="운동 검색"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomeworkNewPage() {
  return (
    <Suspense
      fallback={
        <div className="brutalist-box p-8 bg-white text-center font-bold">
          페이지 로딩 중...
        </div>
      }
    >
      <HomeworkNewContent />
    </Suspense>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMemberProgressGoal, getMemberProgress, recordMemberProgressObservation } from "@/lib/member-progress-data";
import type { MemberChangeOpinion, MemberProgressGoal, MemberProgressGoalInput, MemberProgressObservation, MemberProgressObservationInput, ProgressMetric } from "@/lib/member-progress-types";
import { emptyMeasurement, measurementPayload, parseProgressNumber, progressSeries, seoulToday, type MeasurementDraft } from "@/lib/member-progress-state";

const METRICS = [
  { value: "duration", label: "시간", unit: "seconds" },
  { value: "reps", label: "횟수", unit: "count" },
  { value: "distance", label: "거리", unit: "meters" },
  { value: "difficulty", label: "활동 어려움", unit: "score_0_10" },
] as const;
const sourceLabel = (source: string) => source === "trainer_measurement" ? "강사 측정" : "회원 보고";
const unitLabel = (unit: string) => ({ seconds: "초", count: "회", meters: "m", score_0_10: "점" }[unit] || unit);
type Pending = { kind: "create"; input: MemberProgressGoalInput } | { kind: "reassessment" | "correction"; input: MemberProgressObservationInput };

function MeasurementFields({ draft, onChange, metric, label, correction = false }: { draft: MeasurementDraft; onChange: (value: MeasurementDraft) => void; metric: ProgressMetric; label: string; correction?: boolean }) {
  const patch = (value: Partial<MeasurementDraft>) => onChange({ ...draft, ...value });
  return <>
    <div className="grid grid-cols-2 gap-3">
      <input required readOnly={correction} type="date" max={seoulToday()} value={draft.measuredOn} onChange={(e) => patch({ measuredOn: e.target.value })} className="brutalist-input min-w-0 text-sm" aria-label={`${label} 측정일`} />
      <input disabled={!draft.measured} required={draft.measured} type="number" min={0} max={metric === "difficulty" ? 10 : undefined} step={metric === "difficulty" ? 1 : "any"} value={draft.value} onChange={(e) => patch({ value: e.target.value })} className="brutalist-input min-w-0 text-sm" aria-label={`${label} 값`} placeholder="측정값" />
    </div>
    <select value={draft.measured ? "measured" : "unmeasured"} onChange={(e) => patch({ measured: e.target.value === "measured" })} className="brutalist-input text-sm" aria-label={`${label} 측정 여부`}><option value="measured">측정값 입력</option><option value="unmeasured">측정하지 못함</option></select>
    {!draft.measured && <input required maxLength={200} value={draft.reason} onChange={(e) => patch({ reason: e.target.value })} className="brutalist-input text-sm" aria-label={`${label} 미측정 사유`} placeholder="미측정 사유" />}
    <select disabled={correction} value={draft.source} onChange={(e) => patch({ source: e.target.value as MeasurementDraft["source"] })} className="brutalist-input text-sm" aria-label={`${label} 출처`}><option value="trainer_measurement">강사가 직접 측정</option><option value="member_report">회원이 말한 값</option></select>
    <input maxLength={1000} value={draft.memo} onChange={(e) => patch({ memo: e.target.value })} className="brutalist-input text-sm" aria-label={`${label} 메모`} placeholder="측정 메모 (선택)" />
  </>;
}

export function MemberProgressPanel({ memberId }: { memberId: string }) {
  return <ProgressEditor key={memberId} memberId={memberId} />;
}

function ProgressEditor({ memberId }: { memberId: string }) {
  const [goals, setGoals] = useState<MemberProgressGoal[]>([]);
  const [observations, setObservations] = useState<MemberProgressObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const storageKey = `member-progress-pending:${memberId}`;
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [name, setName] = useState("");
  const [condition, setCondition] = useState("");
  const [metric, setMetric] = useState<ProgressMetric>("duration");
  const [target, setTarget] = useState("");
  const [baseline, setBaseline] = useState(emptyMeasurement);
  const [reassessment, setReassessment] = useState(emptyMeasurement);
  const [opinion, setOpinion] = useState<MemberChangeOpinion>("unknown");
  const [correctingId, setCorrectingId] = useState("");
  const [correction, setCorrection] = useState(emptyMeasurement);
  const [correctionReason, setCorrectionReason] = useState("");
  const selectedMetric = METRICS.find((entry) => entry.value === metric)!;
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId);

  const reload = useCallback(async () => {
    try {
      const result = await getMemberProgress(memberId);
      if (!result.success) throw new Error("변화 기록을 불러오지 못했습니다. 다시 불러와 주세요.");
      setGoals(result.goals || []);
      setObservations(result.observations || []);
      setSelectedGoalId((id) => result.goals?.some((goal) => goal.id === id && goal.is_active) ? id : result.goals?.find((goal) => goal.is_active)?.id || "");
    } catch (err) { setError(err instanceof Error ? err.message : "변화 기록을 불러오지 못했습니다."); }
  }, [memberId]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const request = JSON.parse(stored) as Pending;
        if (["create", "reassessment", "correction"].includes(request.kind) && typeof request.input?.request_id === "string") {
          setPending(request);
          const input = request.input;
          const draft: MeasurementDraft = { measuredOn: input.measured_on, measured: input.value != null, value: input.value == null ? "" : String(input.value), reason: input.unmeasured_reason || "", source: input.source, memo: input.memo || "" };
          if (request.kind === "create") {
            setName(request.input.name); setCondition(request.input.condition); setMetric(request.input.metric); setTarget(String(request.input.target_value)); setBaseline(draft);
          } else if (request.kind === "reassessment") {
            setSelectedGoalId(request.input.goal_id); setReassessment(draft); setOpinion(request.input.opinion || "unknown");
          } else {
            setCorrectingId(request.input.supersedes_observation_id || ""); setCorrection(draft); setCorrectionReason(request.input.correction_reason || "");
          }
        }
      }
    } catch { setError("이전 저장 시도를 복원하지 못했습니다. 기록을 먼저 확인해 주세요."); }
    void reload().finally(() => setLoading(false));
  }, [reload, storageKey]);

  const grouped = useMemo(() => goals.map((goal) => ({ goal, ...progressSeries(goal, observations) })), [goals, observations]);

  async function submit(request: Pending) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(""); setNotice("");
    try {
      // Persist before sending so a reload after response loss reuses the exact request.
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      const result = request.kind === "create" ? await createMemberProgressGoal(request.input) : await recordMemberProgressObservation(request.input);
      if (!result.success) {
        if (!result.retryable) { sessionStorage.removeItem(storageKey); setPending(null); }
        setError(result.retryable ? "저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요." : `저장하지 못했습니다 (${result.reason || "오류"}). 입력 내용을 확인해 주세요.`);
        return;
      }
      sessionStorage.removeItem(storageKey); setPending(null);
      if (request.kind === "create") { setName(""); setCondition(""); setTarget(""); setBaseline(emptyMeasurement()); }
      if (request.kind === "reassessment") { setReassessment(emptyMeasurement()); setOpinion("unknown"); }
      if (request.kind === "correction") { setCorrectingId(""); setCorrectionReason(""); }
      setNotice("저장했습니다.");
      await reload();
    } catch {
      setError("저장 결과를 확인하지 못했습니다. 입력을 보존했습니다. 같은 내용으로 다시 확인해 주세요.");
    } finally { busy.current = false; setSaving(false); }
  }

  function create(event: React.FormEvent) {
    event.preventDefault();
    if (pending || busy.current) return;
    try {
      if (!name.trim() || !condition.trim()) throw new Error("목표와 측정 조건을 입력해 주세요.");
      void submit({ kind: "create", input: { request_id: crypto.randomUUID(), member_id: memberId, name: name.trim(), condition: condition.trim(), metric, direction: metric === "difficulty" ? "decrease" : "increase", unit: selectedMetric.unit, target_value: parseProgressNumber(target, metric), definition_version: 1, ...measurementPayload(baseline, metric) } });
    } catch (err) { setError((err as Error).message); }
  }

  function reassess(event: React.FormEvent) {
    event.preventDefault();
    if (pending || busy.current || !selectedGoal) return;
    try { void submit({ kind: "reassessment", input: { request_id: crypto.randomUUID(), goal_id: selectedGoal.id, definition_version: selectedGoal.definition_version, metric: selectedGoal.metric, unit: selectedGoal.unit as MemberProgressObservationInput["unit"], opinion, ...measurementPayload(reassessment, selectedGoal.metric) } }); }
    catch (err) { setError((err as Error).message); }
  }

  function correct(event: React.FormEvent, goal: MemberProgressGoal) {
    event.preventDefault();
    if (pending || busy.current) return;
    const original = observations.find((row) => row.id === correctingId && row.goal_id === goal.id);
    if (!original || !progressSeries(goal, observations).rows.some((row) => row.id === original.id)) { setError("정정할 최신 기록을 다시 선택해 주세요."); return; }
    try {
      if (!correctionReason.trim()) throw new Error("정정 사유를 입력해 주세요.");
      void submit({ kind: "correction", input: { request_id: crypto.randomUUID(), goal_id: original.goal_id, definition_version: original.definition_version, metric: original.metric, unit: original.unit as MemberProgressObservationInput["unit"], ...measurementPayload({ ...correction, measuredOn: original.measured_on, source: original.source }, original.metric), supersedes_observation_id: original.id, correction_reason: correctionReason.trim() } });
    } catch (err) { setError((err as Error).message); }
  }

  if (loading) return <section className="brutalist-box bg-white p-6 text-sm font-bold">변화 기록 불러오는 중...</section>;
  return <section className="brutalist-box bg-white p-6 space-y-5 min-w-0" aria-labelledby="member-progress-heading">
    <div className="border-b-2 border-black pb-3"><h2 id="member-progress-heading" className="text-xl font-semibold">일상 목표와 변화</h2><p className="mt-1 text-xs text-neutral-600">같은 조건과 같은 출처의 기록을 비교합니다.</p></div>
    {error && <div role="alert" className="border border-red-400 bg-red-50 p-3 text-xs font-bold text-red-800">{error}<button type="button" onClick={() => void reload()} className="ml-2 underline">기록 다시 불러오기</button></div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {pending && <div className="rounded-xl border p-3 text-sm"><p>처리 결과가 확인될 때까지 같은 내용으로 다시 확인합니다.</p><button type="button" disabled={saving} onClick={() => void submit(pending)} className="brutalist-btn-secondary mt-2">{saving ? "저장 확인 중..." : "같은 내용으로 저장 다시 확인"}</button></div>}
    <fieldset disabled={saving || !!pending} className="space-y-5 min-w-0">
      <form onSubmit={create} className="grid gap-3 rounded-2xl border bg-[#FAFAF8] p-4">
        <h3 className="text-sm font-black">새 목표 + 기준선</h3>
        <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 평지에서 10분 걷기" className="brutalist-input text-sm" aria-label="목표명" />
        <textarea required maxLength={500} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="측정 조건: 평지, 보조기 없이" className="brutalist-input text-sm" aria-label="측정 조건" />
        <div className="grid grid-cols-2 gap-3"><select value={metric} onChange={(e) => setMetric(e.target.value as ProgressMetric)} className="brutalist-input min-w-0 text-sm" aria-label="측정 종류">{METRICS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select><input required type="number" min={0} max={metric === "difficulty" ? 10 : undefined} step={metric === "difficulty" ? 1 : "any"} value={target} onChange={(e) => setTarget(e.target.value)} className="brutalist-input min-w-0 text-sm" aria-label="목표값" placeholder="목표값" /></div>
        <MeasurementFields draft={baseline} onChange={setBaseline} metric={metric} label="기준선" />
        <button className="brutalist-btn-primary min-h-11 text-xs font-black">목표와 기준선 저장</button>
      </form>
      {selectedGoal && <form onSubmit={reassess} className="grid gap-3 rounded-2xl border p-4">
        <h3 className="text-sm font-black">재평가 기록</h3>
        <select value={selectedGoalId} onChange={(e) => { setSelectedGoalId(e.target.value); setReassessment(emptyMeasurement()); setOpinion("unknown"); }} className="brutalist-input text-sm" aria-label="재평가 목표">{goals.filter((goal) => goal.is_active).map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select>
        <MeasurementFields draft={reassessment} onChange={setReassessment} metric={selectedGoal.metric} label="재평가" />
        <select value={opinion} onChange={(e) => setOpinion(e.target.value as MemberChangeOpinion)} className="brutalist-input text-sm" aria-label="회원 체감 변화"><option value="unknown">회원 체감: 모르겠음</option><option value="better">회원 체감: 전보다 편해짐</option><option value="same">회원 체감: 비슷함</option><option value="worse">회원 체감: 어려워짐</option></select>
        <button className="brutalist-btn-secondary min-h-11 text-xs font-black">재평가 저장</button>
      </form>}
      {grouped.length === 0 ? <p className="text-xs text-neutral-500">아직 변화 목표가 없습니다.</p> : grouped.map(({ goal, rows, comparisons }) => <article key={goal.id} className="rounded-xl border bg-neutral-50 p-4 space-y-2 min-w-0">
        <h3 className="font-black break-words">{goal.name}</h3><p className="text-xs break-words">{goal.condition}</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">{goal.name} 관찰 기록</caption><thead><tr><th className="py-2">측정일</th><th>값</th><th>출처</th><th>관리</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="py-2">{row.measured_on}</td><td>{row.value === null ? `미측정 (${row.unmeasured_reason})` : `${row.value} ${unitLabel(row.unit)}`}{row.supersedes_observation_id && <span className="block">정정됨</span>}</td><td>{sourceLabel(row.source)}</td><td><button type="button" onClick={() => { setCorrectingId(row.id); setCorrection({ measuredOn: row.measured_on, measured: row.value !== null, value: row.value === null ? "" : String(row.value), reason: row.unmeasured_reason || "", source: row.source, memo: row.memo || "" }); setCorrectionReason(""); }} className="min-h-11 underline">정정</button></td></tr>)}</tbody></table></div>
        {rows.some((row) => row.id === correctingId) && <form onSubmit={(event) => correct(event, goal)} className="grid gap-2 border-t pt-3"><p className="text-xs">원본은 보존되고 새 정정 기록이 연결됩니다.</p><MeasurementFields draft={correction} onChange={setCorrection} metric={goal.metric} label="정정" correction /><input required maxLength={500} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} className="brutalist-input text-sm" placeholder="정정 사유" aria-label="정정 사유" /><button className="brutalist-btn-secondary text-xs">정정 저장</button><button type="button" onClick={() => setCorrectingId("")}>취소</button></form>}
        {comparisons.map(({ source, first, recent }) => first && recent && first.id !== recent.id ? <p key={source} className="text-xs font-bold">{sourceLabel(source)} 기록상 변화: {first.value} → {recent.value} {unitLabel(goal.unit)}</p> : null)}
      </article>)}
    </fieldset>
  </section>;
}

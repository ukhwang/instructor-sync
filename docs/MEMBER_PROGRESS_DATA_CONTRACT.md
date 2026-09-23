# 회원 변화 측정 계약 (G2)

상태: **확정 — G3 스키마/RPC 구현 전 계약**  
확정일: 2026-09-21 (Asia/Seoul)

이 계약은 회원이 `조금 나아졌다`고 느끼는 변화를 상담에 사용할 수 있도록, 숙제 제출 기록과 분리된 목표·관찰값의 최소 구조를 정의한다. 이 단계에서는 데이터베이스나 화면을 변경하지 않는다. 숫자는 건강 진단이나 자세 교정의 증거가 아니라, 같은 조건에서 반복해 본 기능·불편함의 자기보고/강사 측정 기록이다.

## 측정 단위

- 회원당 진행 목표는 동시에 1~3개다.
- 목표는 기능 행동으로 적는다. 예: `양말을 서서 신기`, `10분 걷기`, `브릿지 12회`.
- `condition`은 측정 조건을 고정하는 문장이다. 예: `평지에서 통증을 참지 않고`.
- `direction`은 `increase`, `decrease`, `none` 중 하나다.
- `metric`은 `duration`, `reps`, `distance`, `difficulty` 중 하나다. 기존 숙제의 `현재 느끼는 불편함 1~10`은 별도 보조 지표다.
- `unit`은 metric에 맞는 고정 단위만 허용한다: duration=`seconds`, reps=`count`, distance=`meters`, difficulty=`score_0_10`.
- 목표가 바뀌면 기존 목표를 덮어쓰지 않고 `definition_version`을 1 증가시킨다.

## 입력 계약

목표:

```json
{
  "member_id": "member-123",
  "name": "평지에서 10분 걷기",
  "condition": "보조기 없이, 통증을 참지 않는 속도",
  "metric": "duration",
  "direction": "increase",
  "unit": "seconds",
  "target_value": 600,
  "definition_version": 1
}
```

관찰값(기준선):

```json
{
  "goal_id": "goal-123",
  "definition_version": 1,
  "metric": "duration",
  "unit": "seconds",
  "measured_on": "2026-09-21",
  "value": 300,
  "unmeasured_reason": null,
  "source": "member_report",
  "actor": "member",
  "memo": "5분까지는 쉬지 않고 걸음"
}
```

재측정값:

```json
{
  "goal_id": "goal-123",
  "definition_version": 1,
  "metric": "duration",
  "unit": "seconds",
  "measured_on": "2026-10-05",
  "value": 480,
  "unmeasured_reason": null,
  "source": "trainer_measurement",
  "actor": "trainer",
  "memo": "같은 복도에서 8분, 보행 속도는 회원이 선택"
}
```

측정하지 못한 날은 숫자를 0으로 넣지 않는다.

```json
{
  "goal_id": "goal-123",
  "definition_version": 1,
  "metric": "duration",
  "unit": "seconds",
  "measured_on": "2026-09-28",
  "value": null,
  "unmeasured_reason": "감기",
  "source": "member_report",
  "actor": "member",
  "memo": null
}
```

회원의 체감 변화는 수치와 별도 필드로 한 번만 묻는다: `better | same | worse | unknown`. 이 응답은 그래프 값을 보정하거나 대체하지 않는다.

## 저장·집계 규칙 (G3 이후 구현 기준)

- `measured_on`은 회원이 실제로 수행한 날짜, `created_at`은 입력이 저장된 시각이다. 날짜는 Asia/Seoul 기준 `YYYY-MM-DD`이며 미래 날짜는 거부한다.
- 같은 `goal_id + definition_version + metric + unit + condition`만 한 그래프에 연결한다. 조건·단위·측정법이 바뀌면 새 버전이다.
- 기준선은 첫 유효 숫자, 최근값은 그 뒤의 가장 최근 유효 숫자다. 중간 누락은 선으로 보간하지 않는다.
- 변화량은 `recent - baseline`, 변화율은 기준선이 0이 아닐 때만 계산한다. 표본이 1개면 변화량을 표시하지 않는다.
- 기존 숙제의 불편함 1~10은 `current_discomfort` 보조 시계열로만 보존한다. `pain_area`를 자세나 질환으로 추론하지 않고, 값이 없다고 0으로 기록하지 않는다.
- 그래프 문구는 `기록상 변화`로 표시하며 `치료됨`, `자세가 교정됨` 같은 의학적 확정 표현을 사용하지 않는다.

## 거부해야 하는 예

```json
{ "name": "허리 통증이 치료됨", "condition": "", "metric": "difficulty", "unit": "score_0_10", "direction": "decrease", "target_value": 0, "definition_version": 1 }
```

`condition`이 없고, 치료 결과를 단정하므로 거부한다.

```json
{ "goal_id": "goal-123", "definition_version": 1, "measured_on": "2026-12-31", "value": 8, "source": "member_report", "actor": "member" }
```

미래 날짜이므로 거부한다.

```json
{ "goal_id": "goal-123", "definition_version": 1, "measured_on": "2026-09-21", "value": 11, "source": "member_report", "actor": "member" }
```

`difficulty`의 허용 범위 0~10을 벗어나므로 거부한다.

```json
{ "goal_id": "goal-123", "definition_version": 1, "measured_on": "2026-09-21", "value": 4, "source": "member_report", "actor": "member", "member_id": "other-member" }
```

관찰값에는 목표의 회원과 다른 회원을 지정할 수 없다. 서버는 목표 소유권을 다시 확인해야 한다.

기계 검증의 기준 구현과 경계값은 [`contracts/member-progress-contract.mjs`](../contracts/member-progress-contract.mjs)와 [`tests/member-progress-contract.test.mjs`](../tests/member-progress-contract.test.mjs)에 고정한다.

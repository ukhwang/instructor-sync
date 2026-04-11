import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { GapItem, ReportSummarySchema } from "@/lib/schemas";

export const runtime = "edge";

/** 백엔드 `CONSULTANT_SYSTEM_LEAD`·버전 정책과 정합 (고정 FACT 주입 없음) */
const CONSULTANT_SYSTEM_LEAD =
  "당신은 냉철한 시니어 IT 컨설턴트입니다. " +
  "판단 근거는 오직 이 대화에 주어진 갭 목록·주제·수강자 정보에 한정합니다.";

const VERSION_POLICY_FOR_SUMMARY =
  "**버전·출시 정보:** 라이브러리·프레임워크의 '최신 버전'을 사전 지식으로 추측하지 마십시오. " +
  "갭 JSON·권고문에 이미 적힌 표현만 사용하고, 구체 버전이 없으면 **'최신 버전 확인 필요'**만 쓰십시오.";

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 800,
  apiKey: process.env.OPENAI_API_KEY,
});

function fallbackSummaryBody(prepTimeMin: number, highCount: number) {
  return {
    oneLiner:
      "요약 생성 단계에서 일시적인 오류가 있었습니다. 아래 갭 목록은 그대로 신뢰하시고, 잠시 후 요약만 다시 시도해 주세요.",
    prepTime: `${prepTimeMin}분`,
    actionItems: [] as { priority: number; action: string; estimatedMin: number }[],
    teachingPoints: [] as { point: string; why: string; tip: string }[],
  };
}

/** LLM이 앞뒤에 잡담을 붙여도 `{` ~ 마지막 `}` 구간으로 복구 시도 */
function parseJsonObjectFromLlmText(raw: string): Record<string, unknown> | null {
  const s = raw.replace(/```json|```/g, "").trim();
  try {
    const o = JSON.parse(s) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      const o = JSON.parse(s.slice(start, end + 1)) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function sanitizeDefenseDrills(raw: unknown): { metaphor: string; pressureQuestion: string; talkTrack: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { metaphor: string; pressureQuestion: string; talkTrack: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const d = item as Record<string, unknown>;
    out.push({
      metaphor: typeof d.metaphor === "string" ? d.metaphor : "",
      pressureQuestion: typeof d.pressureQuestion === "string" ? d.pressureQuestion : "",
      talkTrack: typeof d.talkTrack === "string" ? d.talkTrack : "",
    });
  }
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { topic, targetAudience, gaps } = (await req.json()) as {
      topic: string;
      targetAudience: string;
      gaps: GapItem[];
    };

    if (!gaps || gaps.length === 0) {
      const zeroGapPrompt = `${CONSULTANT_SYSTEM_LEAD}

${VERSION_POLICY_FOR_SUMMARY}

당신은 IT 강사의 수업 준비를 돕는 AI 코치입니다. 교안 본문은 제공되지 않았고, 아래 **강의 주제**와 **수강자** 정보만 있습니다.
자동 분석에서는 지식 갭이 탐지되지 않았다는 뜻이므로, 과장 없이 긍정적으로 평가하고 수업 현장에서 나올 수 있는 **구체적인 돌발 질문 1개**를 제시하세요.

강의 주제: ${topic}
수강자: ${targetAudience}

반드시 아래 JSON 형식만 출력하세요. 다른 텍스트·마크다운 금지.
{
  "oneLiner": "교안이 자동 검사 관점에서 양호함을 인정하는 1~2문장(주제·난이도에 맞게 구체적으로)",
  "prepTime": "수업 전 권장 점검 시간 추정 (예: 10분)",
  "actionItems": [],
  "teachingPoints": [],
  "defenseDrills": [
    {
      "metaphor": "핵심 개념을 한 문장 비유로",
      "pressureQuestion": "이 주제·이 수강자층이 물어볼 법한 압박 질문 정확히 1개",
      "talkTrack": "강사가 답변할 때의 방향·포인트 2~3문장"
    }
  ]
}`;

      try {
        const zr = await llm.invoke(zeroGapPrompt);
        const zrText = typeof zr.content === "string" ? zr.content : String(zr.content);
        const parsedObj = parseJsonObjectFromLlmText(zrText);
        if (!parsedObj) throw new Error("zero_gap_json");
        const one = typeof parsedObj.oneLiner === "string" ? parsedObj.oneLiner.trim() : "";
        const prep = typeof parsedObj.prepTime === "string" ? parsedObj.prepTime.trim() : "";
        const result = {
          oneLiner:
            one ||
            "자동 분석에서 구체적 갭은 발견되지 않았습니다. 주제에 맞춰 수업 흐름과 질의응답을 한 번 더 점검해 보세요.",
          prepTime: prep || "15분",
          actionItems: Array.isArray(parsedObj.actionItems) ? parsedObj.actionItems : [],
          teachingPoints: Array.isArray(parsedObj.teachingPoints) ? parsedObj.teachingPoints : [],
          defenseDrills: sanitizeDefenseDrills(parsedObj.defenseDrills),
        };
        const validated = ReportSummarySchema.safeParse(result);
        return NextResponse.json(validated.success ? validated.data : result);
      } catch {
        const fallback = {
          oneLiner:
            "자동 분석에서 지식 갭은 탐지되지 않았습니다. 요약을 생성하는 동안 일시적 오류가 있었으니, 잠시 후 요약 재시도를 이용해 주세요.",
          prepTime: "15분",
          actionItems: [] as { priority: number; action: string; estimatedMin: number }[],
          teachingPoints: [] as { point: string; why: string; tip: string }[],
          defenseDrills: [] as { metaphor: string; pressureQuestion: string; talkTrack: string }[],
        };
        return NextResponse.json(fallback);
      }
    }

    const highCount = gaps.filter((g) => g.severity === "HIGH").length;
    const mediumCount = gaps.filter((g) => g.severity === "MEDIUM").length;
    const prepTimeMin = highCount * 10 + mediumCount * 5;
    const serializedGaps = JSON.stringify(gaps.slice(0, 20));

    const gapSummary = gaps
      .filter((g) => g.severity === "HIGH" || g.severity === "MEDIUM")
      .slice(0, 10)
      .map((g) => `[${g.severity}] ${g.originalText} → ${g.recommendation.slice(0, 50)}`)
      .join("\n");

    let response;
    try {
      response = await llm.invoke(
        `${CONSULTANT_SYSTEM_LEAD}

${VERSION_POLICY_FOR_SUMMARY}

당신은 강사의 수업 준비를 돕는 AI 코치다.
강의 주제: ${topic}
수강자: ${targetAudience}

발견된 주요 갭:
${gapSummary}

[분석 원본 JSON - 최우선 근거]
${serializedGaps}

다음 JSON 형식으로만 응답해라. 다른 텍스트 금지.
{
  "oneLiner": "강사에게 전달할 핵심 요약 2문장. 형식: '전체 강의의 X%가 업데이트 필요합니다. [구체적 항목명]을 수정하면 수업 준비가 완료됩니다.'",
  "actionItems": [
    { "priority": 1, "action": "구체적 행동 1문장 (~하세요 체)", "estimatedMin": 10 },
    { "priority": 2, "action": "구체적 행동 1문장", "estimatedMin": 5 },
    { "priority": 3, "action": "구체적 행동 1문장", "estimatedMin": 5 }
  ],
  "teachingPoints": [
    {
      "point": "강사가 반드시 강조할 핵심 개념. 갭과 직접 연결된 내용 우선. 추상적 표현 금지, 구체적 기술명/개념명 명시",
      "why": "${targetAudience} 입장에서 이 내용을 모르면 생기는 실질적 문제 1문장",
      "tip": "수업에서 바로 쓸 수 있는 구체적 설명 방식 1문장. 예시나 비유 포함 권장"
    }
  ]
}

규칙:
- actionItems는 HIGH 갭 기반으로 최대 3개
- teachingPoints는 최대 3개
- 반드시 완전한 JSON만 출력
- oneLiner에 구체적 기술명/항목명 반드시 포함 (단, 위 버전 정책 위반 금지)
- gaps JSON에 없는 버전·출시 정보를 새로 만들지 말 것
- teachingPoints는 갭이 없는 내용은 포함하지 말 것
- 각 point는 서로 중복되지 않을 것
- 수강자 레벨에 맞는 난이도로 작성`
      );
    } catch {
      const fb = fallbackSummaryBody(prepTimeMin, highCount);
      fb.oneLiner =
        "요약 AI 응답이 지연되었습니다. 갭 목록은 그대로이니, 잠시 후 요약 재시도를 눌러 주세요.";
      const validated = ReportSummarySchema.safeParse(fb);
      return NextResponse.json(validated.success ? validated.data : fb);
    }

    let parsed = { oneLiner: "", actionItems: [] as any[], teachingPoints: [] as any[] };
    try {
      const content = (response.content as string).replace(/```json|```/g, "").trim();
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        oneLiner: `${highCount}개의 중요 업데이트가 필요합니다. 요약 JSON 형식이 일시적으로 깨졌습니다. 갭 카드 내용을 우선 참고해 주세요.`,
        actionItems: [],
        teachingPoints: [],
      };
    }

    const result = {
      oneLiner: parsed.oneLiner,
      prepTime: `${prepTimeMin}분`,
      actionItems: parsed.actionItems,
      teachingPoints: parsed.teachingPoints,
    };

    const validated = ReportSummarySchema.safeParse(result);
    if (!validated.success) {
      return NextResponse.json(result);
    }

    return NextResponse.json(validated.data);
  } catch (e) {
    console.error("[summarize]", e);
    const safe = {
      oneLiner:
        "요약 처리 중 오류가 있었습니다. 갭 분석 결과는 정상적으로 표시될 수 있으니 목록을 먼저 확인해 주세요.",
      prepTime: "—",
      actionItems: [] as { priority: number; action: string; estimatedMin: number }[],
      teachingPoints: [] as { point: string; why: string; tip: string }[],
    };
    return NextResponse.json(safe);
  }
}

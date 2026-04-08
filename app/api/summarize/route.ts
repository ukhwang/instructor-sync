import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { GapItem, ReportSummarySchema } from "@/lib/schemas";

export const runtime = "edge";

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.2,
  maxTokens: 800,
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { topic, targetAudience, gaps } = await req.json() as {
    topic: string;
    targetAudience: string;
    gaps: GapItem[];
  };

  if (!gaps || gaps.length === 0) {
    return NextResponse.json({
      oneLiner: "현재 교안은 최신 트렌드를 완벽하게 반영하고 있습니다. 내용 검증에 소모될 시간을 아껴, 수강생의 몰입을 이끌어낼 '전달 방식'과 '심화 질문 대비'에 집중하시기 바랍니다.",
      prepTime: "10분 (리허설 및 심화 대비)",
      actionItems: [
        { 
          priority: 1, 
          action: "수업 도입부에 활용할 최신 업계 동향이나 뉴스 기사 1개 찾아보기", 
          estimatedMin: 3 
        },
        { 
          priority: 2, 
          action: "핵심 개념을 설명할 새로운 비유나 실생활 예시 1가지 구상하기", 
          estimatedMin: 4 
        },
        { 
          priority: 3, 
          action: "상위권 수강생이 던질 심도 있는 돌발 질문 1가지 예상하고 방어 논리 세우기", 
          estimatedMin: 3 
        }
      ],
      teachingPoints: [],
    });
  }

  // prepTime은 LLM이 아닌 JS로 계산 (결정론적 연산)
  const highCount = gaps.filter(g => g.severity === "HIGH").length;
  const mediumCount = gaps.filter(g => g.severity === "MEDIUM").length;
  const prepTimeMin = (highCount * 10) + (mediumCount * 5);

  const gapSummary = gaps
    .filter(g => g.severity === "HIGH" || g.severity === "MEDIUM")
    .slice(0, 10)
    .map(g => `[${g.severity}] ${g.originalText} → ${g.recommendation.slice(0, 50)}`)
    .join("\n");

  const response = await llm.invoke(
    `당신은 강사의 수업 준비를 돕는 AI 코치다.
강의 주제: ${topic}
수강자: ${targetAudience}

발견된 주요 갭:
${gapSummary}

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
- oneLiner에 구체적 기술명/항목명 반드시 포함
- teachingPoints는 갭이 없는 내용은 포함하지 말 것
- 각 point는 서로 중복되지 않을 것
- 수강자 레벨에 맞는 난이도로 작성`
  );

  let parsed = { oneLiner: "", actionItems: [] as any[], teachingPoints: [] as any[] };
  try {
    const content = (response.content as string)
      .replace(/```json|```/g, "")
      .trim();
    parsed = JSON.parse(content);
  } catch {
    parsed = {
      oneLiner: `${highCount}개의 중요 업데이트가 필요합니다.`,
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

  // Zod 검증
  const validated = ReportSummarySchema.safeParse(result);
  if (!validated.success) {
    return NextResponse.json(result); // 검증 실패해도 반환
  }

  return NextResponse.json(validated.data);
}

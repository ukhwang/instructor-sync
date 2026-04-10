import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { GapItem, ReportSummarySchema } from "@/lib/schemas";

export const runtime = "edge";

/** 백엔드 `CONSULTANT_SYSTEM_LEAD`와 동일한 2026 타임라인 지시 (요약 API) */
const CONSULTANT_SYSTEM_LEAD =
  "당신은 냉철한 시니어 IT 컨설턴트입니다. **현재 시점은 2026년 4월입니다.** " +
  "제공된 Context 맨 앞의 [CRITICAL 2026 FACT]를 절대적인 최우선 진리로 삼아 교안을 검증하십시오. " +
  "검색 결과에 과거 버전(3.x 등)의 정보가 섞여 있더라도 무시하고, " +
  "2026년 최신 기술 기준에 미달하는 모든 레거시 코드를 가차 없이 지적하십시오.";

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.2,
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { topic, targetAudience, gaps } = (await req.json()) as {
      topic: string;
      targetAudience: string;
      gaps: GapItem[];
    };

    if (!gaps || gaps.length === 0) {
      return NextResponse.json({
        oneLiner:
          "자동 탐지된 지식 갭은 없습니다. 다만 릴리즈 리뷰 수준의 시니어 질문(의존성 정합성, 런타임, 성능)까지 커버했는지 최종 브리핑으로 점검하시기 바랍니다.",
        prepTime: "15분 (시니어 릴리즈 리뷰 시뮬레이션)",
        actionItems: [
          {
            priority: 1,
            action:
              "교안 예제의 requirements / lockfile 기준으로 재현 가능한 설치 커맨드 한 줄을 확정하고, 왜 그 버전 범위인지 한 문장으로 근거를 말할 준비를 하세요.",
            estimatedMin: 5,
          },
          {
            priority: 2,
            action:
              "같은 코드 경로에 대해 '콜드 스타트 vs 지속 처리' 시나리오를 나누고, 지연·처리량·비용 중 무엇을 우선할지 트레이드오프를 표로 정리해 보세요.",
            estimatedMin: 5,
          },
          {
            priority: 3,
            action:
              "런타임·주요 라이브러리 메이저 업 시 깨질 수 있는 ABI/휠 이슈를 한 가지 가정하고, 스테이징 검증과 롤백 순서를 말로 시뮬레이션하세요.",
            estimatedMin: 5,
          },
        ],
        teachingPoints: [],
        defenseDrills: [
          {
            metaphor:
              "락파일(resolution)은 항공기 비행계획서와 같습니다. 이륙 전 정합성이 한 번이라도 깨지면, 어디까지 날았든 결국 착륙이 무엇보다 어렵습니다.",
            pressureQuestion:
              "같은 가상환경에서 LangChain 계열과 OpenAI SDK(또는 HTTP 클라이언트) 메이저가 동시에 올라와 transitive 의존성이 충돌했습니다. pip / uv / poetry 중 무엇으로 어떤 순서로 상·하한을 고정하고, CI에서는 어떤 규칙으로 재현성을 검증하시겠습니까?",
            talkTrack:
              "충돌 상위 3패키지를 먼저 식별하고, 각각 pinned range를 선언한 뒤 lockfile을 커밋합니다. CI에서는 frozen install로 스크립트만으로 동일 그래프가 재현되는지 검증한다고 답합니다.",
          },
          {
            metaphor:
              "토큰 파이프라인의 성능은 수업 첫 5분 집중도와 같습니다. '느린 첫 응답'은 설명이 정확해도 신뢰를 깎습니다.",
            pressureQuestion:
              "서버리스 워크로드와 장시간 배치 추론에서 TTFT, 초당 토큰/요청 처리량, 메모리 피크를 분리해 정의해 보세요. 수강생에게 어떤 지표를 어떤 순서로 제시하시겠습니까?",
            talkTrack:
              "워밍업, 배치 크기, 스트리밍, 캐시/양자화 중 이 워크로드에 맞는 한 가지씩만 골라, 대가(비용·지연·정확도)를 숫자 감으로 연결해 설명한다고 말합니다.",
          },
          {
            metaphor:
              "런타임 업그레이드는 하위호환 계약 없이 진행하면 롤밅이 불가능한 배포와 같습니다. ABI와 휠은 보이지 않는 계약서입니다.",
            pressureQuestion:
              "Python 마이너 또는 Node LTS 전환 시 C 확장·휠 의존성으로 빌드가 깨지는 경우를 가정해 보세요. 사전에 어떤 매트릭스로 막고, 실패 시 어떤 순서로 pin과 이미지 태그를 되돌리시겠습니까?",
            talkTrack:
              "멀티 버전 스테이징으로 한 단계씩 승격하고, 실패 시 컨테이너 digest·lockfile·런타임 세트를 묶어서 한 번에 롤백할 수 있게 해 둔다고 답합니다.",
          },
        ],
      });
    }

    const highCount = gaps.filter((g) => g.severity === "HIGH").length;
    const mediumCount = gaps.filter((g) => g.severity === "MEDIUM").length;
    const prepTimeMin = highCount * 10 + mediumCount * 5;

    const gapSummary = gaps
      .filter((g) => g.severity === "HIGH" || g.severity === "MEDIUM")
      .slice(0, 10)
      .map((g) => `[${g.severity}] ${g.originalText} → ${g.recommendation.slice(0, 50)}`)
      .join("\n");

    let response;
    try {
      response = await llm.invoke(
        `${CONSULTANT_SYSTEM_LEAD}

당신은 강사의 수업 준비를 돕는 AI 코치다.
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

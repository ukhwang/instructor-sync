import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { AnalyzeChunkInputSchema, AnalyzeChunkOutput, GapItem } from "@/lib/schemas";
import { z } from "zod";

export const runtime = "edge"; // ✅ Node.js 네이티브 모듈 의존성 없음

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.2,
  maxTokens: 1500,
  apiKey: process.env.OPENAI_API_KEY,
});

async function searchWeb(keyword: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: keyword,
        max_results: 3,
        search_depth: "basic",
        days: 180,
      }),
    });

    if (!res.ok) {
      console.warn(`Tavily failed: ${res.status}`);
      return [];
    }

    const data = await res.json() as {
      results?: { title: string; url: string; content: string }[]
    };

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 300),
    }));
  } catch {
    return [];
  }
}

function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : (c as {text?: string}).text ?? ""))
      .join("");
  }
  return "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();

  // 1. Zod 입력 검증
  const parsed = AnalyzeChunkInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { chunkText, chunkIndex, topic, targetAudience } = parsed.data;

  // 1-5. MOCK 모드 처리 (AI/검색 호출 생략)
  if (process.env.MOCK_MODE === "true") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const mockGaps: GapItem[] = [
      {
        id: crypto.randomUUID(),
        chunkIndex,
        originalText: chunkText.slice(0, 15) || "React 17 특징",
        gapType: "OUTDATED",
        severity: "HIGH",
        recommendation: "최신 버전(React 19) 기능으로 업데이트 권장",
        webEvidence: [
          {
            title: "Next.js 15 & React 19 Updates",
            url: "https://nextjs.org/blog/next-15",
            snippet: "React 19 is now default in Next.js 15...",
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        chunkIndex,
        originalText: "Redux 사용법",
        gapType: "VERIFY",
        severity: "MEDIUM",
        recommendation: "상태 관리는 Zustand나 Context API로 대체 가능한지 검토하세요.",
        webEvidence: [],
      },
    ];

    return NextResponse.json({
      chunkIndex,
      gaps: mockGaps,
      hasGaps: true,
    });
  }

  // 2. 키워드 추출 (LLM Call #1)
  let keywords: string[] = [];
  try {
    const keywordLlm = llm.withStructuredOutput(
      z.object({
        keywords: z.array(z.string()).describe("최신성 검증이 필요한 기술 키워드 (최대 2개)")
      }),
      { name: "extract_keywords" }
    );
    
    const keywordResponse = await keywordLlm.invoke(`다음 교안 텍스트에서 최신성 검증이 필요한 핵심 기술 키워드를 최대 2개만 추출하라.
     
     강의 주제: ${topic}
     교안 텍스트: ${chunkText}`);
     
    keywords = keywordResponse.keywords || [];
  } catch (error) {
    console.error("[Sentry] Keyword Extractor Error:", error);
    keywords = [];
  }

  // 3. Tavily 웹 검색 (키워드당 1회, 최대 2회)
  const searchResults = await Promise.allSettled(
    keywords.slice(0, 2).map((kw) => searchWeb(kw))
  );

  const webContext = searchResults
    .filter((r): r is PromiseFulfilledResult<{ title: string; url: string; snippet: string }[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // 4. GAP 분석 (LLM Call #2)
  const webContextText =
    webContext.length > 0
      ? webContext.map((r, i) => `[인덱스 ${i}] ${r.title} (${r.url}): ${r.snippet}`).join("\n")
      : "웹 검색 결과 없음 - 자체 지식으로 판단";

  const gapAnalyzer = llm.withStructuredOutput(
    z.object({
      gaps: z.array(
        z.object({
          originalText: z.string().describe("교안에서 문제가 되는 원문 구절 (20자 이내)"),
          gapType: z.enum(["OUTDATED", "MISSING", "VERIFY"]).describe("명백히 구식이면 OUTDATED, 누락되었으면 MISSING"),
          severity: z.enum(["HIGH", "MEDIUM", "LOW"]).describe("문제의 치명도"),
          recommendation: z.string().describe("수정 방향이나 방어 논리를 '~하십시오' 형태의 행동 지침 1문장으로 기술"),
          evidenceIndex: z.number().describe("참고한 최신 웹 정보의 인덱스 (0, 1 등). 없으면 -1"),
          expectedQuestion: z.string().describe("트렌드에 민감한 학생이 던질법한 날카롭고 구체적인 압박(돌발) 질문"),
        })
      )
    }),
    { name: "analyze_knowledge_gap" }
  );

  let parsedResponse = { gaps: [] as any[] };
  try {
    parsedResponse = await gapAnalyzer.invoke([
      {
        role: "system",
        content: `당신은 트렌드에 극도로 민감하고 날카로운 통찰력을 가진 'IT/학술 전문 감사관'이자 '일타 강사 코치'다. 당신의 목표는 강사가 수업 중 구식 정보로 인해 망신을 당하지 않도록, 교안(chunkText)과 최신 웹 정보(webContext)를 대조하여 치명적인 지식 갭(Gap)을 찾아내고 방어 논리를 제공하는 것이다.

규칙:
1. 갭 추출 엄격성: 교안에 있는 내용이 웹 정보와 비교해 명백히 구식이거나 틀린 경우(OUTDATED), 또는 교안 주제와 관련해 최근 6개월 내 발표된 핵심 트렌드가 누락된 경우(MISSING)만 추출하라.
2. 필터링: 단순한 단어 차이나 사소한 문맥 차이는 철저히 무시하라. 강사에게 진짜 크리티컬한 정보만 선별해라. (청크당 최대 2개로 제한)
3. expectedQuestion 생성 (가장 중요): 도출된 갭을 바탕으로, 트렌드에 민감하고 똑똑한 학생이 수업 중에 손을 들고 던질 법한 **날카롭고 구체적인 압박 질문**을 작성하라.
  - [나쁜 예]: "Claude의 최신 모델은 무엇인가요?"
  - [좋은 예]: "강사님, 교안에는 npm 설치를 권장하시는데, 최근 Anthropic 공식 문서에서는 환경 충돌을 막기 위해 curl 브루어리 설치를 권장하지 않나요?"
4. recommendation 생성: 강사가 교안을 어떻게 수정해야 하는지, 혹은 학생의 돌발 질문에 어떻게 답변(방어)해야 하는지 '~하십시오' 형태의 행동 지침 1문장으로 작성하라.`
      },
      {
        role: "user",
        content: `대상 수강자: ${targetAudience}\n\n[교안 원문]\n${chunkText}\n\n[최신 웹 정보]\n${webContextText}\n\n위 규칙에 따라 지식 갭을 분석 추출하라.`
      }
    ]);
  } catch (error) {
    console.error("[Sentry] Gap Analyzer Error:", error);
  }

  // 5. 응답 조립 (무너진 JSON 파싱 로직 제거)
  const gaps: GapItem[] = (parsedResponse.gaps || []).map((gap) => ({
    id: crypto.randomUUID(),
    chunkIndex,
    originalText: gap.originalText,
    gapType: gap.gapType,
    severity: gap.severity,
    recommendation: gap.recommendation,
    expectedQuestion: gap.expectedQuestion,
    webEvidence: webContext[gap.evidenceIndex]
      ? [webContext[gap.evidenceIndex]]
      : [],
  }));

  const output: AnalyzeChunkOutput = {
    chunkIndex,
    gaps,
    hasGaps: gaps.length > 0,
  };

  return NextResponse.json(output);
}
import os
import io
import json
import time
import re
import logging
import nbformat
from pypdf import PdfReader
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Any, cast
from dotenv import load_dotenv

_START_TIME = time.time()

# LangChain imports
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from tavily import TavilyClient

# 1. Load environment variables from parent directory explicitly
# .env.local takes precedence over .env
load_dotenv(dotenv_path="../.env.local")
load_dotenv(dotenv_path="../.env")

# 2. Defense logic: Verify API keys
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not TAVILY_API_KEY:
    print("⚠️  [CRITICAL] TAVILY_API_KEY is missing! Search functionality will fail.")
if not OPENAI_API_KEY:
    print("⚠️  [CRITICAL] OPENAI_API_KEY is missing! AI analysis functionality will fail.")

app = FastAPI(title="I.K.S Backend API")

# CORS Settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Clients (키 없을 때 임포트 단계에서 크래시 방지)
tavily: Optional[TavilyClient]
try:
    tavily = TavilyClient(api_key=TAVILY_API_KEY) if TAVILY_API_KEY else None
except Exception:
    tavily = None
    logging.exception("TavilyClient 초기화 실패 — 검색 없이 동작합니다.")

llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.2,
    api_key=OPENAI_API_KEY,
)

# --- Models ---

class WebEvidence(BaseModel):
    title: str
    url: str
    snippet: str

class GapItem(BaseModel):
    """분석 응답 항목. Next.js 앱이 동일 필드를 Supabase `gap_items`에 컬럼으로 저장한다
    (migrated_code, cell_index, page_number 등). FastAPI는 파일 파싱·LLM만 담당한다."""
    id: str
    chunkIndex: int
    cellIndex: Optional[int] = None
    pageNumber: Optional[int] = None
    originalText: str
    migratedCode: Optional[str] = None
    gapType: str # "OUTDATED" | "MISSING" | "VERIFY"
    severity: str # "HIGH" | "MEDIUM" | "LOW"
    recommendation: str
    webEvidence: List[WebEvidence] = []
    expectedQuestion: Optional[str] = None

class AnalyzeResponse(BaseModel):
    chunks: List[Any]
    gaps: List[GapItem]
    hasGaps: bool

# --- Helpers: 포맷별 파싱 → 동일 청크 스키마로 통일 ---

MAX_CHUNKS_PER_ANALYZE = 5
MAX_CONTENT_CHARS_PER_CHUNK = 20_000
MAX_PDF_TOTAL_CHARS = 120_000
PDF_HEAD_TAIL_WINDOW = 6_000

# --- 2026 데모 타임라인 가드 (Tavily 과거 검색 결과와의 충돌 완화) ---

_FACT_CLAUDE = (
    "[CRITICAL 2026 FACT]: 현재 Anthropic의 최신 플래그십 모델은 'Claude 4.6 Opus'임. "
    "(기존 3.x 시리즈는 완전 레거시). 4.6 버전은 Agentic 자동 디버깅 및 IDE 네이티브 통합이 표준임.\n\n"
)
_FACT_NEXT_REACT = (
    "[CRITICAL 2026 FACT]: 현재 Next.js의 표준 버전은 16.2이며, React 19 네이티브 컴파일러가 기본 적용됨. "
    "App Router의 초기 캐싱 이슈는 완전히 해결되었음.\n\n"
)
_FACT_PYTHON = (
    "[CRITICAL 2026 FACT]: Python 3.14가 엔터프라이즈 표준임. "
    "GIL(Global Interpreter Lock)이 완전히 해제된 Free-threaded 빌드가 기본으로 사용됨.\n\n"
)

CONSULTANT_SYSTEM_LEAD = (
    "당신은 냉철한 시니어 IT 컨설턴트입니다. **현재 시점은 2026년 4월입니다.** "
    "제공된 Context 맨 앞의 [CRITICAL 2026 FACT]를 절대적인 최우선 진리로 삼아 교안을 검증하십시오. "
    "검색 결과에 과거 버전(3.x 등)의 정보가 섞여 있더라도 무시하고, "
    "2026년 최신 기술 기준에 미달하는 모든 레거시 코드를 가차 없이 지적하십시오."
)


def inject_2026_context(chunk_text: str, web_context: str) -> str:
    """
    교안 청크 키워드에 맞춰 [CRITICAL 2026 FACT]를 웹 컨텍스트 문자열 맨 앞에 prepend.
    Tavily 본문 앞에 삽입되어 LLM user 메시지의 [최신 웹 정보] 섹션 최상단에 위치함.
    """
    hay = chunk_text.lower()
    blocks: List[str] = []
    if re.search(r"\bclaude\b", hay) or "클로드" in chunk_text:
        blocks.append(_FACT_CLAUDE)
    if re.search(r"next\.js|nextjs|\breact\b", hay, re.IGNORECASE):
        blocks.append(_FACT_NEXT_REACT)
    if re.search(r"\bpython\b", hay) or "파이썬" in chunk_text:
        blocks.append(_FACT_PYTHON)
    if not blocks:
        return web_context
    return "".join(blocks) + web_context


def extract_code_from_ipynb(content: bytes) -> List[dict]:
    """Jupyter Notebook에서 코드 셀만 추출 (노트북 셀 인덱스 보존)."""
    nb = nbformat.reads(content.decode("utf-8"), as_version=4)
    code_cells: List[dict] = []
    for i, cell in enumerate(nb.cells):
        if cell.cell_type == "code":
            code_cells.append({"cell_index": i, "content": cell.source})
    return code_cells


def extract_full_text_from_pdf(content: bytes) -> List[dict]:
    """
    pypdf + BytesIO로 디스크 없이 PDF 전 페이지 텍스트를 추출해 하나의 문자열로 합칩니다.
    이후 파이프라인은 ipynb와 동일하게 chunk 리스트(단일 항목)로 처리합니다.
    """
    reader = PdfReader(io.BytesIO(content))
    parts: List[str] = []
    for page in reader.pages:
        try:
            raw = page.extract_text()
        except Exception:
            logging.warning("PDF 페이지 텍스트 추출 실패 — 해당 페이지 스킵")
            continue
        if raw and raw.strip():
            parts.append(_normalize_text_for_llm(raw.strip()))
    merged = "\n\n".join(parts).strip()
    if not merged:
        return []
    merged = _truncate_for_llm(merged, MAX_PDF_TOTAL_CHARS, PDF_HEAD_TAIL_WINDOW)
    return [{"content": merged, "page_num": 1}]


def _normalize_text_for_llm(text: str) -> str:
    """
    PDF 추출 노이즈(깨진 제어문자/과도한 공백)를 정리해 토큰 낭비와 파싱 실패를 줄입니다.
    """
    cleaned = text.replace("\x00", " ")
    cleaned = re.sub(r"[\uFFFD]", "", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _truncate_for_llm(text: str, max_chars: int, head_tail_window: int) -> str:
    """
    너무 긴 텍스트는 앞/뒤 핵심 구간을 남기고 절삭합니다.
    """
    if len(text) <= max_chars:
        return text
    head = text[:head_tail_window]
    tail = text[-head_tail_window:]
    omitted = len(text) - (len(head) + len(tail))
    marker = f"\n\n[TRUNCATED_FOR_TOKEN_LIMIT: omitted {omitted} chars]\n\n"
    combined = f"{head}{marker}{tail}"
    return combined[:max_chars]

def _parse_llm_gap_json(raw: str) -> List[dict]:
    """LLM 응답에서 JSON 배열만 안전하게 추출 (마크다운/노이즈 허용)."""
    s = raw.replace("```json", "").replace("```", "").strip()
    try:
        data = json.loads(s)
        if isinstance(data, list):
            return cast(List[dict], data)
        if isinstance(data, dict):
            inner = data.get("gaps")
            if isinstance(inner, list):
                return cast(List[dict], inner)
    except json.JSONDecodeError:
        pass
    start, end = s.find("["), s.rfind("]")
    if start != -1 and end > start:
        try:
            data = json.loads(s[start : end + 1])
            if isinstance(data, list):
                return cast(List[dict], data)
        except json.JSONDecodeError:
            pass
    return []

async def analyze_gap(content: str, topic: str, target: str, index: int, source_type: str) -> List[GapItem]:
    content = _truncate_for_llm(_normalize_text_for_llm(content), MAX_CONTENT_CHARS_PER_CHUNK, 8_000)
    if not content:
        return []

    """RAG 파이프라인으로 지식 갭 분석"""
    # 1. Tavily 검색 리서치
    search_query = f"Latest updates and common pitfalls for {topic} in context of: {content[:200]}"
    search_result: dict = {"results": []}
    web_context = "No recent web data found."
    if tavily is not None:
        try:
            search_result = tavily.search(query=search_query, search_depth="basic", max_results=2)
            web_context = "\n".join(
                [f"Source: {r['url']}\nContent: {r['content']}" for r in search_result.get("results", [])]
            )
        except Exception:
            logging.exception("Tavily 검색 실패 — 웹 컨텍스트 없이 진행합니다.")
            search_result = {"results": []}

    web_context = inject_2026_context(content, web_context)

    # 2. LLM 분석
    system_prompt = f"""{CONSULTANT_SYSTEM_LEAD}

당신은 IT 강사의 교안을 분석하여 최신 트렌드와 어긋나는 '지식 갭'을 찾아내는 전문가입니다.
대상 강의 주제: {topic}
수강자 수준: {target}

분석 규칙:
1. 제공된 [교안 원문]이 최신 업계 표준이나 API(예: OpenAI, Claude 등)와 비교해 구식이거나 틀린 경우를 찾으십시오.
2. 발견된 경우, 수정된 코드(migratedCode)와 추천 답변을 제안하십시오.
3. 반드시 JSON 리스트 형식으로만 응답하며, 갭이 없으면 빈 리스트 []를 반환하십시오.
[
  {{
    "originalText": "문제가 되는 구절",
    "migratedCode": "최신 코드 제안 (없으면 null)",
    "gapType": "OUTDATED",
    "severity": "HIGH",
    "recommendation": "수정 가이드",
    "expectedQuestion": "똑똑한 학생이 던질법한 압박 질문"
  }}
]"""

    user_prompt = f"[교안 원문]\n{content}\n\n[최신 웹 정보]\n{web_context}"

    try:
        response = await llm.ainvoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
        )
    except Exception:
        logging.exception("LLM ainvoke 실패 — 이 청크는 갭 없이 건너뜁니다.")
        return []

    content_str = (
        response.content if isinstance(response.content, str) else str(response.content)
    )
    raw_gaps = _parse_llm_gap_json(content_str)

    gaps: List[GapItem] = []
    for rg in raw_gaps:
        try:
            gaps.append(
                GapItem(
                    id=f"gap-{os.urandom(4).hex()}",
                    chunkIndex=index,
                    cellIndex=index if source_type == "ipynb" else None,
                    pageNumber=index if source_type == "pdf" else None,
                    originalText=rg["originalText"],
                    migratedCode=rg.get("migratedCode"),
                    gapType=rg["gapType"],
                    severity=rg["severity"],
                    recommendation=rg["recommendation"],
                    webEvidence=[
                        WebEvidence(title=r["title"], url=r["url"], snippet=r["content"][:100])
                        for r in search_result.get("results", [])
                    ],
                    expectedQuestion=rg.get("expectedQuestion"),
                )
            )
        except (KeyError, TypeError, ValueError):
            logging.warning("갭 항목 필드 누락/형식 오류 — 해당 항목 스킵")
            continue
    return gaps

# --- Endpoints ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "I.K.S FastAPI Backend is running"}

@app.get("/v1/health")
async def health_check():
    """Cron-job.org 핑용 경량 헬스체크. DB/LLM 호출 없음."""
    return {
        "status": "healthy",
        "uptime_seconds": round(time.time() - _START_TIME),
        "keys_loaded": {
            "openai": bool(OPENAI_API_KEY),
            "tavily": bool(TAVILY_API_KEY),
        }
    }

@app.post("/api/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    topic: str = Form(...),
    targetAudience: str = Form(...)
):
    """파일 타입에 따라 파싱 후 지식 갭 분석 실행 (내부 에러 로깅)"""
    try:
        content = await file.read()
        filename = (file.filename or "").lower()

        if filename.endswith(".ipynb"):
            chunks = extract_code_from_ipynb(content)
            source_type = "ipynb"
        elif filename.endswith(".pdf"):
            chunks = extract_full_text_from_pdf(content)
            source_type = "pdf"
        else:
            raise HTTPException(
                status_code=400,
                detail="Only .ipynb or .pdf files are supported",
            )

        all_gaps = []
        for chunk in chunks[:MAX_CHUNKS_PER_ANALYZE]:
            gaps = await analyze_gap(
                chunk["content"], 
                topic, 
                targetAudience, 
                chunk.get("cell_index") or chunk.get("page_num"),
                source_type
            )
            all_gaps.extend(gaps)
            
        return {
            "chunks": chunks,
            "gaps": all_gaps,
            "hasGaps": len(all_gaps) > 0,
            "sourceType": source_type
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("analyze_file 실패")
        err = str(e).lower()
        if "timeout" in err or "timed out" in err or "read timed out" in err:
            return {
                "chunks": [],
                "gaps": [],
                "hasGaps": False,
                "sourceType": "unknown",
                "errorMessage": "현재 분석 서버 부하로 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
            }
        return {
            "chunks": [],
            "gaps": [],
            "hasGaps": False,
            "sourceType": "unknown",
            "errorMessage": "분석 처리 중 오류가 발생했지만 서버는 안전하게 복구되었습니다. 잠시 후 다시 시도해 주세요.",
        }

@app.post("/api/export")
async def export_patched_notebook(
    file: UploadFile = File(...),
    gap_items_json: str = Form(...)
):
    """Jupyter Notebook 수정 및 수출"""
    if not file.filename.lower().endswith(".ipynb"):
        raise HTTPException(status_code=400, detail="Patch export is only available for .ipynb files")

    try:
        content = await file.read()
        nb = nbformat.reads(content.decode("utf-8"), as_version=4)
        patches = json.loads(gap_items_json)
        
        for patch in patches:
            idx = patch.get("cell_index")
            if idx is not None and 0 <= idx < len(nb.cells):
                nb.cells[idx].source = patch["migrated_code"]
        
        output = io.StringIO()
        nbformat.write(nb, output)
        mem = io.BytesIO()
        mem.write(output.getvalue().encode("utf-8"))
        mem.seek(0)
        
        return StreamingResponse(
            mem,
            media_type="application/x-ipynb+json",
            headers={"Content-Disposition": f"attachment; filename=patched_{file.filename}"}
        )
    except Exception:
        logging.exception("export_patched_notebook 실패")
        raise HTTPException(status_code=500, detail="노트북 수정본 생성 중 오류가 발생했습니다.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

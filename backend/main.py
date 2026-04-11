import os
import io
import json
import time
import re
import asyncio
import logging
import nbformat
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Tuple, cast
from dotenv import load_dotenv

_START_TIME = time.time()

# LangChain imports
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
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

llm: Optional[ChatOpenAI] = None
if OPENAI_API_KEY:
    try:
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            max_tokens=2000,
            timeout=55,
            api_key=OPENAI_API_KEY,
        )
    except Exception:
        logging.exception("ChatOpenAI 초기화 실패")
        llm = None
else:
    logging.error("OPENAI_API_KEY 없음 — /api/analyze LLM 단계는 사용할 수 없습니다.")


async def _invoke_llm(messages: List[BaseMessage]) -> Any:
    """ainvoke 미지원·런타임 차이에 대비해 동기 invoke는 스레드로 오프로딩."""
    if llm is None:
        raise RuntimeError("OPENAI_API_KEY가 없거나 LLM 초기화에 실패했습니다.")
    ainvoke = getattr(llm, "ainvoke", None)
    if callable(ainvoke):
        return await ainvoke(messages)
    return await asyncio.to_thread(llm.invoke, messages)


def _tavily_result_rows(search_result: Any) -> List[dict]:
    """Tavily 응답 스키마 차이로 인한 KeyError 방지."""
    if not isinstance(search_result, dict):
        return []
    raw = search_result.get("results")
    if not isinstance(raw, list):
        return []
    rows: List[dict] = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        title = str(r.get("title") or "")
        url = str(r.get("url") or "")
        body = r.get("content") if r.get("content") is not None else r.get("snippet")
        content = str(body or "")
        rows.append({"title": title, "url": url, "content": content})
    return rows


# --- Models ---

class WebEvidence(BaseModel):
    title: str
    url: str
    snippet: str

class LectureGuide(BaseModel):
    """교수 설계 힌트. API·프론트는 quickLab 키로 직렬화한다."""
    emphasis: List[str] = Field(default_factory=list)
    analogies: List[str] = Field(default_factory=list)
    faq: List[str] = Field(default_factory=list)
    quick_lab: List[str] = Field(default_factory=list)

    def model_dump_api(self) -> dict:
        return {
            "emphasis": self.emphasis,
            "analogies": self.analogies,
            "faq": self.faq,
            "quickLab": self.quick_lab,
        }


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
    lectureGuide: Optional[LectureGuide] = None

# --- Helpers: 포맷별 파싱 → 동일 청크 스키마로 통일 ---

MAX_CHUNKS_PER_ANALYZE = 3
MAX_CONTENT_CHARS_PER_CHUNK = 20_000
MAX_PDF_TOTAL_CHARS = 120_000
PDF_HEAD_TAIL_WINDOW = 6_000

CONSULTANT_SYSTEM_LEAD = (
    "당신은 냉철한 시니어 IT 컨설턴트이자 AI 교수 설계자(Instructional Designer)입니다. "
    "판단 근거는 오직 사용자 메시지의 [교안 원문]과 [최신 웹 정보](Tavily 검색 스니펫)에 한정합니다."
)

VERSION_AND_WEB_POLICY = (
    "**버전·출시 정보(필수 준수):** 라이브러리·프레임워크·런타임·API의 '최신 버전'을 당신의 사전 지식으로 추측하지 마십시오. "
    "반드시 [최신 웹 정보] 본문에 **문자 그대로 명시된** 버전·날짜만 인용·반영하십시오. "
    "해당 본문에 버전이 없으면 구체 숫자를 지어내지 말고, 문구 **'최신 버전 확인 필요'**만 사용하십시오. "
    "migratedCode·recommendation·expectedQuestion·lecture_guide 문구에도 동일 규칙을 적용합니다."
)


def extract_code_from_ipynb(content: bytes) -> List[dict]:
    """Jupyter Notebook에서 코드 셀만 추출 (노트북 셀 인덱스 보존)."""
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="replace")
    nb = nbformat.reads(text, as_version=4)
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
    if not content:
        return []
    if len(content) > 50 * 1024 * 1024:
        raise ValueError("PDF 파일이 50MB를 초과합니다.")

    try:
        reader = PdfReader(io.BytesIO(content), strict=False)
    except (PdfReadError, ValueError, OSError, MemoryError) as e:
        logging.exception("PDF 열기/파싱 실패")
        raise ValueError(f"PDF를 읽을 수 없습니다: {e}") from e

    parts: List[str] = []
    try:
        for page in reader.pages:
            try:
                raw = page.extract_text()
            except Exception:
                logging.warning("PDF 페이지 텍스트 추출 실패 — 해당 페이지 스킵")
                continue
            if raw and raw.strip():
                parts.append(_normalize_text_for_llm(raw.strip()))
    except Exception as e:
        logging.exception("PDF 페이지 순회 실패")
        raise ValueError(f"PDF 텍스트 추출 중 오류: {e}") from e

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

def _json_from_llm_text(raw: str) -> Any:
    """LLM 응답 문자열에서 JSON 객체 또는 배열을 최대한 복구."""
    s = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    lb, rb = s.find("{"), s.rfind("}")
    if lb != -1 and rb > lb:
        try:
            return json.loads(s[lb : rb + 1])
        except json.JSONDecodeError:
            pass
    start, end = s.find("["), s.rfind("]")
    if start != -1 and end > start:
        try:
            return json.loads(s[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


def _parse_llm_analyze_payload(raw: str) -> Tuple[List[dict], Any]:
    """갭 배열과 선택적 lecture_guide 원본을 분리 (구형 순수 배열 응답 호환)."""
    data = _json_from_llm_text(raw)
    if data is None:
        return [], None
    if isinstance(data, list):
        return cast(List[dict], data), None
    if isinstance(data, dict):
        gaps = data.get("gaps")
        if not isinstance(gaps, list):
            gaps = []
        lg = data.get("lecture_guide")
        if lg is None:
            lg = data.get("lectureGuide")
        return cast(List[dict], gaps), lg
    return [], None


def _dedupe_preserve_order(items: List[str]) -> List[str]:
    seen: set[str] = set()
    out: List[str] = []
    for x in items:
        key = " ".join(x.split()).casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(x)
    return out


def _coerce_string_list(val: Any) -> List[str]:
    if val is None:
        return []
    if isinstance(val, str):
        s = val.strip()
        return [s] if s else []
    if isinstance(val, list):
        out: List[str] = []
        for item in val:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
        return out
    return []


def _coerce_faq_list(val: Any) -> List[str]:
    """FAQ: 문자열 또는 {q,a} 객체 리스트를 단일 블록 문자열로 정규화."""
    if val is None:
        return []
    if isinstance(val, str):
        s = val.strip()
        return [s] if s else []
    if not isinstance(val, list):
        return []
    out: List[str] = []
    for item in val:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
        elif isinstance(item, dict):
            q = item.get("q") or item.get("question")
            a = item.get("a") or item.get("answer")
            lines: List[str] = []
            if q is not None and str(q).strip():
                lines.append(f"Q: {str(q).strip()}")
            if a is not None and str(a).strip():
                lines.append(f"A: {str(a).strip()}")
            if lines:
                out.append("\n".join(lines))
    return out


def _parse_lecture_guide_obj(raw: Any) -> Optional[LectureGuide]:
    if not isinstance(raw, dict):
        return None
    try:
        emphasis = _coerce_string_list(raw.get("emphasis"))
        analogies = _coerce_string_list(raw.get("analogies"))
        faq = _coerce_faq_list(raw.get("faq"))
        quick = _coerce_string_list(raw.get("quick_lab", raw.get("quickLab")))
        lg = LectureGuide(
            emphasis=emphasis,
            analogies=analogies,
            faq=faq,
            quick_lab=quick,
        )
        if not (lg.emphasis or lg.analogies or lg.faq or lg.quick_lab):
            return None
        return lg
    except (TypeError, ValueError):
        logging.warning("lecture_guide 객체 형식 오류 — 해당 청크 가이드 스킵")
        return None


def _merge_lecture_guides(parts: List[Optional[LectureGuide]]) -> Optional[LectureGuide]:
    em: List[str] = []
    an: List[str] = []
    fq: List[str] = []
    ql: List[str] = []
    for p in parts:
        if p is None:
            continue
        em.extend(p.emphasis)
        an.extend(p.analogies)
        fq.extend(p.faq)
        ql.extend(p.quick_lab)
    merged = LectureGuide(
        emphasis=_dedupe_preserve_order(em),
        analogies=_dedupe_preserve_order(an),
        faq=_dedupe_preserve_order(fq),
        quick_lab=_dedupe_preserve_order(ql),
    )
    if not (merged.emphasis or merged.analogies or merged.faq or merged.quick_lab):
        return None
    return merged


async def analyze_gap(
    content: str, topic: str, target: str, index: int, source_type: str
) -> Tuple[List[GapItem], Optional[LectureGuide]]:
    """RAG 파이프라인으로 지식 갭 분석 및 선택적 교수 가이드."""
    content = _truncate_for_llm(_normalize_text_for_llm(content), MAX_CONTENT_CHARS_PER_CHUNK, 8_000)
    if not content:
        return [], None

    # 1. Tavily 검색 리서치
    search_query = f"Latest updates and common pitfalls for {topic} in context of: {content[:200]}"
    search_result: dict = {"results": []}
    web_context = "No recent web data found."
    if tavily is not None:
        try:
            raw = tavily.search(query=search_query, search_depth="basic", max_results=2)
            search_result = raw if isinstance(raw, dict) else {"results": []}
            rows = _tavily_result_rows(search_result)
            if rows:
                web_context = "\n".join(
                    [f"Source: {r['url']}\nContent: {r['content']}" for r in rows]
                )
        except Exception:
            logging.exception("Tavily 검색 실패 — 웹 컨텍스트 없이 진행합니다.")
            search_result = {"results": []}

    # 2. LLM 분석 (웹 컨텍스트는 Tavily 결과만 사용 — 고정 FACT 주입 없음)
    system_prompt = f"""{CONSULTANT_SYSTEM_LEAD}

{VERSION_AND_WEB_POLICY}

당신은 IT 강사의 교안을 분석하여 (1) 최신 트렌드와 어긋나는 '지식 갭'을 찾고, (2) 같은 교안을 바탕으로 수업 품질을 높이는 교수 가이드를 제안합니다.
대상 강의 주제: {topic}
수강자 수준: {target}

분석 규칙 (지식 갭):
1. [교안 원문]을 [최신 웹 정보] 근거와 비교해 구식이거나 사실과 어긋나는 경우를 찾으십시오. 웹 정보가 비어 있거나 부족하면 보수적으로 판단하고, 버전 숫자는 절대 추측하지 마십시오.
2. 발견 시 migratedCode·recommendation·expectedQuestion을 채우십시오. 갭이 없으면 gaps는 빈 배열 []입니다.

교수 가이드 (lecture_guide, 동일 응답 내 필수 키 — 내용은 교안·웹 근거에 맞게 채우되 없으면 빈 배열):
- emphasis: 수업에서 반드시 짚어야 할 기둥 개념 (짧은 문장 배열)
- analogies: 기술 개념을 일상/비전공 눈높이로 풀 비유 (문장 배열)
- faq: 학습자가 헷갈리거나 날카롭게 물을 수 있는 Q&A (문자열 배열. 각 항목은 "Q: ...\\nA: ..." 형식 권장)
- quick_lab: 이론 직후 5분 내외 미니 실습 과제 (문장 배열)

응답 형식: 반드시 아래 구조의 JSON 객체 **한 개만** (마크다운·설명 문장 없이).
{{
  "gaps": [
    {{
      "originalText": "문제가 되는 구절",
      "migratedCode": "최신 코드 제안 (없으면 null)",
      "gapType": "OUTDATED",
      "severity": "HIGH",
      "recommendation": "수정 가이드",
      "expectedQuestion": "똑똑한 학생이 던질법한 압박 질문"
    }}
  ],
  "lecture_guide": {{
    "emphasis": [],
    "analogies": [],
    "faq": [],
    "quick_lab": []
  }}
}}"""

    user_prompt = f"[교안 원문]\n{content}\n\n[최신 웹 정보]\n{web_context}"

    try:
        response = await _invoke_llm(
            [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
        )
    except Exception:
        logging.exception("LLM 호출 실패 — 이 청크는 갭 없이 건너뜁니다.")
        return [], None

    content_str = (
        response.content if isinstance(response.content, str) else str(response.content)
    )
    raw_gaps, lg_raw = _parse_llm_analyze_payload(content_str)
    lecture_guide = _parse_lecture_guide_obj(lg_raw)

    tavily_rows = _tavily_result_rows(search_result if isinstance(search_result, dict) else {})
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
                        WebEvidence(
                            title=tr["title"],
                            url=tr["url"],
                            snippet=(tr["content"] or "")[:100],
                        )
                        for tr in tavily_rows
                    ],
                    expectedQuestion=rg.get("expectedQuestion"),
                )
            )
        except (KeyError, TypeError, ValueError):
            logging.warning("갭 항목 필드 누락/형식 오류 — 해당 항목 스킵")
            continue
    return gaps, lecture_guide

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
            "openai_llm_ready": llm is not None,
            "tavily": bool(TAVILY_API_KEY),
        }
    }

@app.post("/api/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    topic: str = Form(...),
    targetAudience: str = Form(...)
):
    """파일 타입에 따라 파싱 후 지식 갭 분석 실행."""
    try:
        content = await file.read()
        filename = (file.filename or "").lower()

        if filename.endswith(".ipynb"):
            try:
                chunks = extract_code_from_ipynb(content)
            except Exception as e:
                logging.exception("ipynb 파싱 실패")
                raise HTTPException(status_code=500, detail=f"노트북 파싱 실패: {e}") from e
            source_type = "ipynb"
        elif filename.endswith(".pdf"):
            try:
                chunks = extract_full_text_from_pdf(content)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            except Exception as e:
                logging.exception("PDF 파싱 실패")
                raise HTTPException(status_code=500, detail=f"PDF 처리 오류: {e}") from e
            source_type = "pdf"
        else:
            raise HTTPException(
                status_code=400,
                detail="Only .ipynb or .pdf files are supported",
            )

        if chunks and llm is None:
            raise HTTPException(
                status_code=500,
                detail="OPENAI_API_KEY가 설정되지 않았거나 LLM 초기화에 실패했습니다. 서버 환경 변수를 확인하세요.",
            )

        all_gaps: List[GapItem] = []
        guide_parts: List[Optional[LectureGuide]] = []
        for chunk in chunks[:MAX_CHUNKS_PER_ANALYZE]:
            gaps, lecture_guide = await analyze_gap(
                chunk["content"],
                topic,
                targetAudience,
                chunk.get("cell_index") or chunk.get("page_num"),
                source_type,
            )
            all_gaps.extend(gaps)
            guide_parts.append(lecture_guide)

        merged_guide = _merge_lecture_guides(guide_parts)

        return {
            "chunks": chunks,
            "gaps": all_gaps,
            "hasGaps": len(all_gaps) > 0,
            "sourceType": source_type,
            "lectureGuide": merged_guide.model_dump_api() if merged_guide else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("analyze_file 실패")
        err = str(e).lower()
        if "timeout" in err or "timed out" in err or "read timed out" in err:
            raise HTTPException(
                status_code=503,
                detail="현재 분석 서버 부하로 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
            ) from e
        raise HTTPException(
            status_code=500,
            detail=str(e) or repr(e),
        ) from e

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

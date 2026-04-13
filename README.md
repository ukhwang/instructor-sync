---
title: Instructor Sync API
emoji: 🚀
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# 🎓 백스테이지 코치 (Backstage Coach)

**수업 전 교강사를 위한 교안 점검 및 프리티칭 AI**  
(프로젝트 코드명: Instructor's Knowledge Sync - I.K.S)

![Next.js](https://img.shields.io/badge/Next.js-black?style=flat-square&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)

## 📌 프로젝트 소개 (Overview)

AI/IT 기술 변화 속도가 빠른 환경에서, 교강사는 과거 교안(`.ipynb`, `.pdf`)이 현재 버전에서도 유효한지 반복 검증해야 하는 비효율을 겪습니다.

백스테이지 코치는 교안을 최신 웹 스니펫과 대조해 **지식 갭(Gap)을 시각화**하고, 수업 직전 질의응답 대응을 위한 **프리티칭(Pre-teaching) 코칭**을 제공하는 실전형 점검 솔루션입니다.

## 🎯 심사위원 테스트 가이드 (For Judges)

1. **파일 업로드:** 외부 라이브러리 코드가 포함된 `.ipynb` 또는 `.pdf` 교안을 업로드합니다.
2. **지식 갭 탐지 확인:** 최신 웹 스니펫(Tavily) 기반으로 구식/누락 포인트가 심각도 배지와 함께 표시되는지 확인합니다.
3. **마이그레이션 다운로드 (`.ipynb` 한정):** 제안 코드가 반영된 수정본 Export를 확인합니다.
4. **Zero-gap 브리핑 확인:** 갭 미탐지 시에도 `defenseDrills` 중심 브리핑이 생성되는지 확인합니다.

## 🚀 핵심 기능 (Core Features)

- **Jupyter/PDF 맞춤형 파싱:** `nbformat`으로 `.ipynb` 코드 셀 인덱스를 보존해 파싱하고, PDF는 `_truncate_for_llm`(head-tail 절삭)으로 입력 길이를 제어합니다.
- **웹 검색 증강 검증:** 정상 API 키 환경에서 Tavily(`search_depth="basic"`, `max_results=2`)로 최신 웹 스니펫을 수집해 교안 최신성을 검증합니다.
- **환각 억제 전략:** `VERSION_AND_WEB_POLICY` 정책으로 웹 스니펫에 명시된 팩트 중심 인용을 유도해 버전 환각 리스크를 낮춥니다.
- **청크 단위 단일 응답 구조:** 정상 환경 기준, 분석 청크당 LLM 1회 호출로 `gaps`와 `lecture_guide`를 동일 JSON으로 수신해 중복 호출을 줄입니다.

## 🛠 시스템 아키텍처 (Architecture)

- **Backend (FastAPI):** 파일 파싱, 검색 증강 분석, `/api/analyze` 전담
- **Edge API (Next.js):** 동적 요약/브리핑 생성, `/api/summarize` 전담 (Edge Runtime)
- **데이터 정합성:** `ReportSummarySchema`(Zod) 검증으로 응답 파손 가능성 완화
- **저장 계층:** Supabase `reports`, `gap_items` 기반 리포트/갭 데이터 관리

## 💻 로컬 실행 방법 (Getting Started)

### 1) Clone

```bash
git clone https://github.com/ukhwang/instructor-sync.git
cd instructor-sync
```

### 2) Frontend (Next.js)

```bash
npm install
npm run dev
# http://localhost:3000
```

### 3) Backend (FastAPI)

```bash
cd backend
python -m venv venv
# Windows (PowerShell)
venv\Scripts\Activate.ps1
# macOS/Linux
# source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
# http://localhost:8000
```

### 4) Environment Variables

로컬 개발 시 **프로젝트 루트**의 `.env.local`(또는 `.env`)에 아래 값을 설정합니다.  
(프론트엔드와 백엔드 모두 루트 환경변수를 참조)

- `OPENAI_API_KEY`
- `TAVILY_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `(선택) NEXT_PUBLIC_BACKEND_URL` (기본값: `http://localhost:8000`)

## 🤝 AI Collaboration (AI 협업 증빙)

본 프로젝트는 공모전 취지에 맞춰 AI 협업 과정을 문서화했습니다.

- [AI 협업 보고서](docs/AI_COLLAB_REPORT.md)
- [AI 협업 지침서](docs/AI_COLLAB_POLICY.md)
- [AI 프롬프트 로그](docs/AI_PROMPT_LOG.md)

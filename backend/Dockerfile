# 파이썬 3.11 환경 사용 (가볍고 빠름)
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 라이브러리 목록 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 나머지 모든 코드 복사
COPY . .

# Hugging Face 기본 포트 7860 개방
EXPOSE 7860

# FastAPI 서버 실행 (7860 포트)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]

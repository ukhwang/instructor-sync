# 1. 베이스 이미지 설정
FROM python:3.10-slim

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 의존성 파일 복사 및 설치
COPY ./requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /app/requirements.txt

# 4. 백엔드 코드 복사 (루트의 backend 폴더를 컨테이너의 /app/backend로 복사)
COPY ./backend /app/backend

# 5. 권한 문제 방지를 위한 사용자 추가 (Hugging Face 권장 사항)
RUN useradd -m -u 1000 user
USER user

# 6. 환경 변수 설정 (파이썬 출력 버퍼링 제거)
ENV PYTHONUNBUFFERED=1

# 7. 허깅페이스 전용 포트 개방
EXPOSE 7860

# 8. 서버 구동 명령어 (backend.main의 app 객체 실행)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]

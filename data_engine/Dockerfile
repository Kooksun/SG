# Python 3.11 slim 이미지를 기반으로 사용
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 필요한 패키지 설치를 위해 requirements.txt 복사
COPY requirements.txt .

# 의존성 패키지 설치 (캐시 삭제로 용량 최적화)
RUN pip install --no-cache-dir -r requirements.txt

# 소스 코드 복사 (.dockerignore에서 제외된 파일은 복사되지 않음)
COPY . .

# 불필요한 파일 삭제 (혹시 남아있을 수 있는 파일들)
RUN rm -rf __pycache__ *.pyc

# 스케줄러 실행
CMD ["python", "scheduler_rtdb.py"]

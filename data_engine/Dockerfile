# Python 3.11 slim 이미지를 기반으로 사용
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 필요한 패키지 설치를 위해 requirements.txt 복사
COPY requirements.txt .

# 의존성 패키지 설치
RUN pip install --no-cache-dir -r requirements.txt

# 나머지 코드 파일들 복사
COPY . .

# 스케줄러 실행
CMD ["python", "scheduler_rtdb.py"]

---
trigger: always_on
---

- PYTHON 실행은 venv 환경을 이용한다
- 웹브라우저를 직접 실행하지 않는다
- 백엔드 파일의 실행은 직접 실행(예: nohup, python -m ...)하지 않고, `backend/control.sh` 스크립트를 사용하거나 로컬이 아닌 환경에서는 `v3_deploy.sh` 스크립트를 이용한다.
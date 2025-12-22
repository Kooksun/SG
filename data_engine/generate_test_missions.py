import sys
import os
from datetime import datetime

# Add current directory to path to import mission_manager
sys.path.append(os.path.dirname(__file__))

import mission_manager
from firestore_client import db

def main():
    if len(sys.argv) < 2:
        print("사용법: python data_engine/generate_test_missions.py <user_id> [all]")
        print("예: python data_engine/generate_test_missions.py my_uid_123")
        print("전체 사용자 미션 생성: python data_engine/generate_test_missions.py all")
        return

    target = sys.argv[1]

    if target == "all":
        print("모든 사용자에 대해 미션을 생성합니다...")
        users = db.collection("users").stream()
        count = 0
        for user in users:
            mission_manager.generate_daily_missions(user.id)
            mission_manager.update_mission_progress(user.id)
            count += 1
        print(f"총 {count}명의 사용자에 대해 미션이 생성/업데이트되었습니다.")
    else:
        print(f"사용자 '{target}'에 대해 미션을 생성합니다...")
        mission_manager.generate_daily_missions(target)
        mission_manager.update_mission_progress(target)
        print("미션 생성 및 진행도 업데이트가 완료되었습니다.")

if __name__ == "__main__":
    main()

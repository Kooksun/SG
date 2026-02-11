from backend.firebase_config import main_db

def force_cleanup():
    print("Forcing Chart Data Cleanup...")
    try:
        main_db.child('system/requests/chart').delete()
        main_db.child('system/data/chart').delete()
        print("Success: RTDB Chart paths cleared.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    force_cleanup()

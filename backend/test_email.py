import os
import sys
from dotenv import load_dotenv

# Add the root directory to path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.append(root_dir)

try:
    from backend.email_utils import email_manager
except ImportError:
    from email_utils import email_manager

def test_send_email():
    print("--- Email Sending Test ---")
    
    # Load env specifically for this test
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
    
    email_user = os.getenv('EMAIL_USER')
    email_password = os.getenv('EMAIL_APP_PASSWORD')
    
    if email_user == 'your-email@gmail.com' or not email_password:
        print("Error: Please configure EMAIL_USER and EMAIL_APP_PASSWORD in backend/.env first.")
        print("Note: You need to generate an 'App Password' from Google Account settings.")
        return

    print(f"Attempting to send a test email to: {email_user}")
    
    subject = "[Stock Game] SMTP 연동 테스트"
    body = """
    <h1>주식 게임 이메일 연동 성공!</h1>
    <p>본 메일은 Python 백엔드에서 SMTP를 통해 발송된 테스트 메일입니다.</p>
    <ul>
        <li>발송 시간: {}</li>
        <li>발송 계정: {}</li>
    </ul>
    <p>이제 이 기능을 사용하여 유저들에게 게임 리포트를 보낼 수 있습니다.</p>
    """.format(os.popen('date').read(), email_user)

    success = email_manager.send_email(email_user, subject, body, is_html=True)
    
    if success:
        print("\nSUCCESS: Test email has been sent. Please check your inbox.")
    else:
        print("\nFAILURE: Failed to send test email. Check the error logs above.")

if __name__ == "__main__":
    test_send_email()

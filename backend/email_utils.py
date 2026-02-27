import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from firebase_admin import auth
from .firebase_config import main_app

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)

class EmailManager:
    def __init__(self):
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
        self.email_user = os.getenv('EMAIL_USER')
        self.email_password = os.getenv('EMAIL_APP_PASSWORD')
        self.from_name = os.getenv('EMAIL_FROM_NAME', 'Stock Game')

    def get_user_email(self, uid):
        """Fetches the email associated with a Firebase UID."""
        try:
            user = auth.get_user(uid, app=main_app)
            return user.email
        except Exception as e:
            print(f"Error fetching email for UID {uid}: {e}")
            return None

    def send_email(self, to_email, subject, body, is_html=False):
        """Sends an email using Gmail SMTP."""
        if not self.email_user or not self.email_password:
            print("Email credentials not configured in .env")
            return False

        try:
            msg = MIMEMultipart()
            msg['From'] = f"{self.from_name} <{self.email_user}>"
            msg['To'] = to_email
            msg['Subject'] = subject

            content_type = 'html' if is_html else 'plain'
            msg.attach(MIMEText(body, content_type))

            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.email_user, self.email_password)
            server.send_message(msg)
            server.quit()

            print(f"Email successfully sent to {to_email}")
            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False

    def send_game_report(self, uid, subject, content_html):
        """Helper to send a game report to a user by UID."""
        to_email = self.get_user_email(uid)
        if not to_email:
            return False
            
        return self.send_email(to_email, subject, content_html, is_html=True)

# Global instance
email_manager = EmailManager()

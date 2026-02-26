import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.sender_email = os.getenv('SENDER_EMAIL', '').strip()
        self.sender_password = os.getenv('SENDER_PASSWORD', '').replace(' ', '').strip()
        self.app_url = os.getenv('APP_URL', 'http://localhost:3000')

    def send_proposal_notification(
        self,
        recipient_email: str,
        park_name: str,
        proposal_id: int,
        end_date: str,
        description: str = "",
    ) -> bool:
        """
        Send email notification about new proposal

        Args:
            recipient_email: Email address to send to
            park_name: Name of the park
            proposal_id: ID of the proposal
            end_date: End date for voting
            description: Brief description of the proposal

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            try:
                parsed_date = datetime.strptime(end_date, "%B %d, %Y")
                formatted_date = parsed_date.strftime("%B %d, %Y")
            except:
                formatted_date = end_date

            msg = MIMEMultipart('alternative')
            msg['Subject'] = f'🏛️ New Community Proposal: {park_name} Protection Initiative'
            msg['From'] = f'UrbanLeaf AI <{self.sender_email}>'
            msg['To'] = recipient_email

            text_content = f"""
UrbanLeaf AI - Community Voting Platform

New Proposal Requires Your Vote!

Park: {park_name}
Voting Deadline: {formatted_date}

{description if description else 'A new community proposal has been created for park protection.'}

Your vote matters! Please review the proposal and cast your vote before the deadline.

Vote Now: {self.app_url}/proposal

---
This is an automated notification from UrbanLeaf AI
            """

            html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Proposal - {park_name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);">

                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                🏛️ New Community Proposal
                            </h1>
                            <p style="margin: 10px 0 0 0; color: #d1fae5; font-size: 14px; font-weight: 500;">
                                Your Vote is Needed
                            </p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #cbd5e1;">
                                Dear Community Member,
                            </p>

                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #cbd5e1;">
                                A new proposal has been created and requires your attention. Your participation in community governance is vital for protecting our urban green spaces.
                            </p>

                            <!-- Proposal Details Card -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0f172a; border-radius: 12px; overflow: hidden; margin: 24px 0; border: 2px solid #10b981;">
                                <tr>
                                    <td style="padding: 24px;">
                                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <p style="margin: 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Park Name</p>
                                                    <p style="margin: 4px 0 0 0; font-size: 20px; color: #10b981; font-weight: 700;">{park_name}</p>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 16px 0 8px 0; border-top: 1px solid #334155;">
                                                    <p style="margin: 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Voting Deadline</p>
                                                    <p style="margin: 4px 0 0 0; font-size: 18px; color: #f59e0b; font-weight: 600;">⏰ {formatted_date}</p>
                                                </td>
                                            </tr>
                                            {f'''<tr>
                                                <td style="padding: 16px 0 8px 0; border-top: 1px solid #334155;">
                                                    <p style="margin: 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Description</p>
                                                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">{description}</p>
                                                </td>
                                            </tr>''' if description else ''}
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Call to Action -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="{self.app_url}/proposal" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); transition: all 0.3s ease;">
                                            🗳️ Review & Vote Now
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #94a3b8; text-align: center;">
                                Your vote helps shape the future of our community's green spaces
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #0f172a; padding: 24px 30px; border-top: 1px solid #334155;">
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-align: center;">
                                This is an automated notification from UrbanLeaf AI
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">
                                AI-Powered Urban Intelligence Platform
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, 'plain')
            part2 = MIMEText(html_content, 'html')
            msg.attach(part1)
            msg.attach(part2)

            logger.info(f"Sending proposal notification email to {recipient_email}")

            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)

            logger.info(f"Proposal notification email sent successfully to {recipient_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send proposal notification email: {e}")
            import traceback
            traceback.print_exc()
            return False


# Singleton instance
email_service = EmailService()


def send_proposal_notification_email(
    park_name: str,
    proposal_id: int,
    end_date: str,
    description: str = "",
    recipient_email: str = "vaibhav25vemula23@gmail.com"
) -> bool:
    """
    Convenience function to send proposal notification

    Args:
        park_name: Name of the park
        proposal_id: ID of the proposal
        end_date: End date for voting
        description: Brief description of the proposal
        recipient_email: Email to send to (default: vaibhav25vemula23@gmail.com)

    Returns:
        bool: True if email sent successfully
    """
    return email_service.send_proposal_notification(
        recipient_email=recipient_email,
        park_name=park_name,
        proposal_id=proposal_id,
        end_date=end_date,
        description=description
    )

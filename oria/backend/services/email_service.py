"""
Service d'envoi d'emails transactionnels (smtplib).
Variables d'env: SMTP_HOST, SMTP_PORT (def 587), SMTP_USER, SMTP_PASSWORD, SMTP_FROM
Si SMTP_HOST est vide, log uniquement (mode dev).
"""
import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

SMTP_HOST     = os.getenv("SMTP_HOST", "")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", "mairie@oria.local")
EMAIL_ENABLED = bool(SMTP_HOST and SMTP_USER)


def send_email(to: str, subject: str, body_html: str, body_text: str = "") -> bool:
    if not EMAIL_ENABLED:
        logger.info(f"[EMAIL SIMULÉ] To: {to} | Subject: {subject}")
        return True  # retourne True pour ne pas bloquer les tests
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        if body_text:
            msg.attach(MIMEText(body_text, "plain", "utf-8"))
        msg.attach(MIMEText(body_html, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, to, msg.as_string())
        logger.info(f"Email envoyé à {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Erreur envoi email à {to}: {e}")
        return False


def _html_wrapper(commune_nom: str, content: str) -> str:
    return f"""
<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <div style="background: #003189; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">🏛 {commune_nom}</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
    {content}
    <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
      Message automatique — Oria Mairie
    </p>
  </div>
</div>"""


def send_ticket_response(email: str, nom: str, titre: str, reponse: str, commune_nom: str = "la mairie") -> bool:
    subject = f"Réponse à votre demande — {titre}"
    content = f"""
      <p>Bonjour <strong>{nom}</strong>,</p>
      <p>Votre demande <em>« {titre} »</em> a reçu une réponse :</p>
      <blockquote style="background: #fff; border-left: 4px solid #003189; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0; font-style: italic;">
        {reponse}
      </blockquote>"""
    return send_email(email, subject, _html_wrapper(commune_nom, content),
                      f"Bonjour {nom},\n\nRéponse à « {titre} »:\n\n{reponse}")


def send_convocation(email: str, nom: str, date: str, heure: str, lieu: str, odj: str, commune_nom: str = "la mairie") -> bool:
    subject = f"Convocation — Conseil municipal du {date}"
    content = f"""
      <p>Bonjour <strong>{nom}</strong>,</p>
      <p>Vous êtes convoqué(e) au <strong>Conseil municipal</strong> :</p>
      <ul>
        <li>📅 <strong>Date :</strong> {date}</li>
        <li>🕐 <strong>Heure :</strong> {heure}</li>
        <li>📍 <strong>Lieu :</strong> {lieu}</li>
      </ul>
      <h3 style="color: #003189;">Ordre du jour :</h3>
      <pre style="background: #fff; border: 1px solid #ddd; padding: 12px; border-radius: 4px; font-family: inherit; white-space: pre-wrap; font-size: 13px;">{odj or '(à définir)'}</pre>"""
    return send_email(email, subject, _html_wrapper(commune_nom, content),
                      f"Convocation — Conseil municipal du {date}\nHeure: {heure}\nLieu: {lieu}\n\nOrdre du jour:\n{odj}")

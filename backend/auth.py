import os
import re
import secrets
import json
import socket
import smtplib
import string
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from email.message import EmailMessage
from functools import wraps
from flask import request, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash
from models import Restaurant, AdminUser
from db import db


# ======================
# ADMIN LOGIN
# ======================

def admin_login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")

    if not email:
        return jsonify({"error": "Email không được để trống"}), 400

    admin_password = os.getenv("ADMIN_PASSWORD", "dev")
    admin_password_hash = generate_password_hash(admin_password)

    if not password or not check_password_hash(admin_password_hash, password):
        return jsonify({"error": "Unauthorized"}), 401

    env_allowed = {
        e.strip().lower()
        for e in os.getenv("ADMIN_ALLOWED_EMAILS", "").split(",")
        if e.strip()
    }
    db_allowed = AdminUser.query.filter_by(email=email, is_active=True).first()
    active_count = AdminUser.query.filter_by(is_active=True).count()

    # Bootstrap mode: allow first login and create initial admin account when list is empty.
    if not env_allowed and active_count == 0 and not db_allowed:
        admin_user = AdminUser(email=email, is_active=True)
        db.session.add(admin_user)
        db.session.commit()
        db_allowed = admin_user

    if email not in env_allowed and not db_allowed:
        return jsonify({"error": "Email không có quyền đăng nhập admin"}), 403

    session["admin_logged_in"] = True
    session["admin_email"] = email
    return jsonify({"status": "success", "email": email})


# ======================
# CHECK LOGIN
# ======================

def admin_check():
    if session.get("admin_logged_in"):
        return jsonify({"logged_in": True, "email": session.get("admin_email")})
    return jsonify({"logged_in": False}), 401


# ======================
# LOGOUT
# ======================

def admin_logout():
    session.clear()
    return jsonify({"status": "logged_out"})


# ======================
# OWNER LOGIN
# ======================

def owner_login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username và mật khẩu không được để trống"}), 400

    restaurant = Restaurant.query.filter_by(owner_username=username, is_active=True).first()

    if not restaurant or not restaurant.owner_password_hash:
        return jsonify({"error": "Tài khoản không hợp lệ"}), 401

    if not check_password_hash(restaurant.owner_password_hash, password):
        return jsonify({"error": "Tài khoản không hợp lệ"}), 401

    session["owner_logged_in"] = True
    session["owner_restaurant_id"] = restaurant.id
    session["owner_username"] = restaurant.owner_username

    return jsonify({
        "status": "success",
        "restaurant_id": restaurant.id,
        "username": restaurant.owner_username
    })


def owner_check():
    if session.get("owner_logged_in"):
        return jsonify({
            "logged_in": True,
            "restaurant_id": session.get("owner_restaurant_id"),
            "username": session.get("owner_username")
        })
    return jsonify({"logged_in": False}), 401


def owner_logout():
    session.pop("owner_logged_in", None)
    session.pop("owner_restaurant_id", None)
    session.pop("owner_username", None)
    return jsonify({"status": "logged_out"})


# ======================
# CUSTOMER OTP LOGIN
# ======================

OTP_STORE = {}


def _parse_smtp_port(raw_port):
    value = (raw_port or "").strip()
    if not value:
        return 587, None
    try:
        port = int(value)
    except ValueError:
        return None, f"SMTP_PORT không hợp lệ: {value}"

    if port <= 0 or port > 65535:
        return None, f"SMTP_PORT vượt phạm vi hợp lệ: {port}"

    return port, None


def _is_true(raw_value, default=False):
    if raw_value is None:
        return default
    return str(raw_value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _resolve_smtp_targets(host, port, prefer_ipv4=True):
    try:
        addr_info = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except Exception as exc:
        return [], f"DNS lookup thất bại cho {host}:{port} ({exc})"

    if prefer_ipv4:
        addr_info.sort(key=lambda item: 0 if item[0] == socket.AF_INET else 1)

    targets = []
    seen = set()
    for family, _socktype, _proto, _canon, sockaddr in addr_info:
        ip = sockaddr[0]
        key = (family, ip)
        if key in seen:
            continue
        seen.add(key)
        targets.append((family, ip))

    if not targets:
        return [], f"Không resolve được địa chỉ cho {host}:{port}"

    return targets, None


def _probe_smtp_connectivity(host, port, prefer_ipv4=True):
    targets, err = _resolve_smtp_targets(host, port, prefer_ipv4=prefer_ipv4)
    if err:
        return None, err

    errors = []
    for family, ip in targets:
        sock = None
        try:
            sock = socket.socket(family, socket.SOCK_STREAM)
            sock.settimeout(8)
            sock.connect((ip, port))
            return ip, None
        except OSError as exc:
            errno_value = getattr(exc, "errno", "?")
            errors.append(f"{ip} errno={errno_value} {exc}")
        except Exception as exc:
            errors.append(f"{ip} {exc}")
        finally:
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass

    return None, "; ".join(errors)


def _build_otp_text(otp):
    return (
        f"Mã OTP đăng nhập NearBite của bạn là: {otp}\n"
        f"Mã có hiệu lực trong 5 phút."
    )


def _send_otp_via_resend(email, otp):
    api_key = (os.getenv("RESEND_API_KEY") or "").strip()
    from_email = (os.getenv("RESEND_FROM_EMAIL") or os.getenv("SMTP_FROM") or "").strip()

    if not api_key or not from_email:
        return False, "Thiếu RESEND_API_KEY hoặc RESEND_FROM_EMAIL"

    payload = {
        "from": from_email,
        "to": [email],
        "subject": "NearBite - Mã OTP đăng nhập",
        "text": _build_otp_text(otp)
    }

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status = getattr(response, "status", 200)
            if status < 200 or status >= 300:
                body = response.read().decode("utf-8", errors="ignore")
                return False, f"Resend trả về HTTP {status}: {body[:300]}"
        return True, None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        return False, f"Resend HTTP {exc.code}: {body[:300]}"
    except Exception as exc:
        return False, f"Resend lỗi kết nối: {exc}"


def _send_otp_via_brevo_api(email, otp):
    api_key = (os.getenv("BREVO_API_KEY") or "").strip()
    sender_email = (os.getenv("BREVO_SENDER_EMAIL") or os.getenv("SMTP_FROM") or "").strip()
    sender_name = (os.getenv("BREVO_SENDER_NAME") or "NearBite").strip() or "NearBite"

    if not api_key or not sender_email:
        return False, "Thiếu BREVO_API_KEY hoặc BREVO_SENDER_EMAIL"

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email}],
        "subject": "NearBite - Mã OTP đăng nhập",
        "textContent": _build_otp_text(otp)
    }

    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "api-key": api_key,
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status = getattr(response, "status", 200)
            if status < 200 or status >= 300:
                body = response.read().decode("utf-8", errors="ignore")
                return False, f"Brevo API trả về HTTP {status}: {body[:300]}"
        return True, None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        return False, f"Brevo API HTTP {exc.code}: {body[:300]}"
    except Exception as exc:
        return False, f"Brevo API lỗi kết nối: {exc}"


def _send_otp_email(email, otp):
    provider = (os.getenv("OTP_EMAIL_PROVIDER") or "auto").strip().lower()
    last_error = None

    if provider in {"smtp", "auto"}:
        sent, err = _send_otp_email_via_smtp(email, otp)
        if sent:
            return True, None
        last_error = f"SMTP: {err}"
        if provider == "smtp":
            return False, last_error

    if provider in {"resend", "auto"}:
        sent, err = _send_otp_via_resend(email, otp)
        if sent:
            return True, None
        if provider == "resend":
            return False, f"Resend: {err}"
        last_error = f"{last_error}; Resend: {err}" if last_error else f"Resend: {err}"

    if provider in {"brevo", "brevo_api", "auto"}:
        sent, err = _send_otp_via_brevo_api(email, otp)
        if sent:
            return True, None
        if provider in {"brevo", "brevo_api"}:
            return False, f"Brevo API: {err}"
        last_error = f"{last_error}; Brevo API: {err}" if last_error else f"Brevo API: {err}"

    return False, last_error or "Không có kênh gửi email khả dụng"


def _send_otp_email_via_smtp(email, otp):
    smtp_host = (os.getenv("SMTP_HOST") or "").strip()
    smtp_port, port_error = _parse_smtp_port(os.getenv("SMTP_PORT", "587"))
    if port_error:
        return False, port_error

    smtp_mode = os.getenv("SMTP_MODE", "starttls").strip().lower()
    smtp_user = (os.getenv("SMTP_USER") or "").strip()
    smtp_password = (os.getenv("SMTP_PASSWORD") or "").strip()
    smtp_from = (os.getenv("SMTP_FROM") or smtp_user).strip()
    smtp_prefer_ipv4 = _is_true(os.getenv("SMTP_PREFER_IPV4"), default=True)

    # Support legacy flag style without breaking existing deployments.
    smtp_secure = (os.getenv("SMTP_SECURE") or "").strip().lower()
    if smtp_secure in {"ssl", "true", "1"}:
        smtp_mode = "ssl"
    elif smtp_secure in {"starttls", "tls"}:
        smtp_mode = "starttls"
    elif smtp_secure in {"plain", "none", "false", "0"}:
        smtp_mode = "plain"

    if not smtp_host or not smtp_user or not smtp_password or not smtp_from:
        return False, "SMTP chưa được cấu hình"

    if smtp_mode not in {"starttls", "ssl", "plain"}:
        return False, f"SMTP_MODE không hợp lệ: {smtp_mode}"

    connect_host, connect_error = _probe_smtp_connectivity(
        smtp_host,
        smtp_port,
        prefer_ipv4=smtp_prefer_ipv4
    )
    if not connect_host:
        return False, (
            f"Không thể kết nối SMTP server {smtp_host}:{smtp_port} từ môi trường deploy. "
            f"Chi tiết: {connect_error}"
        )

    msg = EmailMessage()
    msg["Subject"] = "NearBite - Mã OTP đăng nhập"
    msg["From"] = smtp_from
    msg["To"] = email
    msg.set_content(_build_otp_text(otp))

    try:
        if smtp_mode == "ssl":
            with smtplib.SMTP_SSL(connect_host, smtp_port, timeout=15) as server:
                server.ehlo()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(connect_host, smtp_port, timeout=15) as server:
                server.ehlo()
                if smtp_mode == "starttls":
                    server.starttls()
                    server.ehlo()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
        return True, None
    except Exception as exc:
        return False, str(exc)


def customer_request_otp():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"error": "Email không hợp lệ"}), 400

    otp = "".join(secrets.choice(string.digits) for _ in range(6))
    OTP_STORE[email] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=5)
    }

    sent, error = _send_otp_email(email, otp)
    if not sent:
        otp_debug_fallback = os.getenv("OTP_DEBUG_FALLBACK", "false").strip().lower() == "true"
        if otp_debug_fallback:
            return jsonify({
                "status": "success",
                "message": "OTP đã tạo ở môi trường local",
                "debug_otp": otp
            })
        return jsonify({"error": f"Không gửi được OTP: {error}"}), 500

    return jsonify({"status": "success", "message": "OTP đã được gửi tới email"})


def customer_verify_otp():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()

    record = OTP_STORE.get(email)
    if not record:
        return jsonify({"error": "OTP không tồn tại hoặc đã hết hạn"}), 400

    if datetime.utcnow() > record["expires_at"]:
        OTP_STORE.pop(email, None)
        return jsonify({"error": "OTP đã hết hạn"}), 400

    if record["otp"] != otp:
        return jsonify({"error": "OTP không đúng"}), 400

    OTP_STORE.pop(email, None)
    session["customer_logged_in"] = True
    session["customer_email"] = email

    return jsonify({"status": "success", "email": email})


def customer_check():
    if session.get("customer_logged_in") and session.get("customer_email"):
        return jsonify({
            "logged_in": True,
            "email": session.get("customer_email")
        })
    return jsonify({"logged_in": False}), 401


def customer_logout():
    session.pop("customer_logged_in", None)
    session.pop("customer_email", None)
    return jsonify({"status": "logged_out"})


# ======================
# DECORATOR
# ======================

def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("admin_logged_in") and not session.get("owner_logged_in"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper

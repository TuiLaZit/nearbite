import os
from functools import wraps
from flask import request, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash


# ======================
# ADMIN LOGIN
# ======================

def admin_login():
    data = request.get_json()
    password = data.get("password")

    admin_password = os.getenv("ADMIN_PASSWORD", "dev")
    admin_password_hash = generate_password_hash(admin_password)

    if not password or not check_password_hash(admin_password_hash, password):
        return jsonify({"error": "Unauthorized"}), 401

    session["admin_logged_in"] = True
    return jsonify({"status": "success"})


# ======================
# CHECK LOGIN
# ======================

def admin_check():
    if session.get("admin_logged_in"):
        return jsonify({"logged_in": True})
    return jsonify({"logged_in": False}), 401


# ======================
# LOGOUT
# ======================

def admin_logout():
    session.clear()
    return jsonify({"status": "logged_out"})


# ======================
# DECORATOR
# ======================

def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper

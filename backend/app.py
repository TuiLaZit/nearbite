from flask import Flask, jsonify
from flask_cors import CORS
from db import db
import os
from routes.user import register_user_routes
from routes.admin import register_admin_routes
from auth import admin_login, admin_check, admin_logout

app = Flask(__name__)

app.secret_key = "dev-secret-key"   # 🔥 KHÔNG dùng getenv lúc này

app.static_folder = 'static'

CORS(
    app,
    resources={r"/*": {
        "origins": [
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            "https://nearbite.vercel.app",
        ]
    }},
    supports_credentials=True,
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"]
)

# Tự động detect môi trường production (HTTPS)
is_production = os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_STATIC_URL")

app.config.update(
    SESSION_COOKIE_SAMESITE="None" if is_production else "Lax",
    SESSION_COOKIE_SECURE=True if is_production else False,
    SESSION_COOKIE_HTTPONLY=True
)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)


@app.route("/")
def home():
    return jsonify({"status": "ok"})

@app.route("/admin/login", methods=["POST"])
def login():
    return admin_login()

@app.route("/admin/check", methods=["GET"])
def check():
    return admin_check()

@app.route("/admin/logout", methods=["POST"])
def logout():
    return admin_logout()

register_user_routes(app)
register_admin_routes(app)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)


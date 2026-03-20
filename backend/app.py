from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from db import db
import os
from routes.user import register_user_routes
from routes.admin import register_admin_routes
from auth import (
    admin_login,
    admin_check,
    admin_logout,
    owner_login,
    owner_check,
    owner_logout,
    customer_request_otp,
    customer_verify_otp,
    customer_check,
    customer_logout,
)
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

app.static_folder = 'static'

CORS(
    app,
    resources={r"/*": {
        "origins": [
            # Local development
            "http://127.0.0.1:5000",
            "http://localhost:5000",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            # Production
            "https://nearbite.vercel.app",
            r"https://.*\.vercel\.app"
        ]
    }},
    supports_credentials=True,
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Type", "Authorization"]
)

# Thêm middleware để handle OPTIONS requests
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        origin = request.headers.get('Origin')
        response = jsonify({"status": "ok"})
        
        # KHÔNG DÙNG wildcard "*" khi có credentials
        # Phải trả về specific origin
        if origin:
            response.headers.add("Access-Control-Allow-Origin", origin)
        else:
            response.headers.add("Access-Control-Allow-Origin", "https://nearbite.vercel.app")
        
        response.headers.add("Access-Control-Allow-Credentials", "true")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
        response.headers.add("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        return response, 200

# Tự động detect môi trường production (HTTPS)
is_production = bool(os.getenv("RENDER"))

app.config.update(
    SESSION_COOKIE_SAMESITE="None" if is_production else "Lax",
    SESSION_COOKIE_SECURE=True if is_production else False,
    SESSION_COOKIE_HTTPONLY=True
)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

# Auto create missing tables in local development so new features can run
# without manual migration steps.
auto_create_tables_env = (os.getenv("AUTO_CREATE_TABLES") or "").strip().lower()
if auto_create_tables_env:
    auto_create_tables = auto_create_tables_env in {"1", "true", "yes", "on"}
else:
    auto_create_tables = not bool(is_production)

if auto_create_tables:
    with app.app_context():
        db.create_all()


@app.route("/")
def home():
    # Serve index.html for SPA routing
    frontend_index = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist', 'index.html')
    if os.path.exists(frontend_index):
        return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'), 'index.html')
    return jsonify({"status": "ok"})

@app.route("/<path:path>")
def serve_frontend(path):
    # Serve frontend static files
    frontend_dist = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
    file_path = os.path.join(frontend_dist, path)
    
    # Security: prevent directory traversal
    try:
        file_path = os.path.abspath(file_path)
        if not file_path.startswith(os.path.abspath(frontend_dist)):
            return jsonify({"error": "Not Found"}), 404
    except:
        return jsonify({"error": "Not Found"}), 404
    
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(frontend_dist, path)
    
    # Fallback to index.html for SPA routing
    if os.path.exists(os.path.join(frontend_dist, 'index.html')):
        return send_from_directory(frontend_dist, 'index.html')
    
    return jsonify({"error": "Not Found"}), 404

@app.route("/admin/login", methods=["POST"])
def login():
    return admin_login()

@app.route("/admin/check", methods=["GET"])
def check():
    return admin_check()

@app.route("/admin/logout", methods=["POST"])
def logout():
    return admin_logout()

@app.route("/owner/login", methods=["POST"])
def owner_login_route():
    return owner_login()

@app.route("/owner/check", methods=["GET"])
def owner_check_route():
    return owner_check()

@app.route("/owner/logout", methods=["POST"])
def owner_logout_route():
    return owner_logout()

@app.route("/customer/request-otp", methods=["POST"])
def customer_request_otp_route():
    return customer_request_otp()

@app.route("/customer/verify-otp", methods=["POST"])
def customer_verify_otp_route():
    return customer_verify_otp()

@app.route("/customer/check", methods=["GET"])
def customer_check_route():
    return customer_check()

@app.route("/customer/logout", methods=["POST"])
def customer_logout_route():
    return customer_logout()

@app.route("/static/<path:path>")
def serve_static(path):
    """Serve static files with CORS headers"""
    response = send_from_directory('static', path)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
    return response

register_user_routes(app)
register_admin_routes(app)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))


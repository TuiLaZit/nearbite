from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from db import db
import os
from werkzeug.security import generate_password_hash
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
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            "http://localhost:5173",
            "http://localhost:3000",
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
is_production = os.getenv("RENDER") or os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_STATIC_URL")

app.config.update(
    SESSION_COOKIE_SAMESITE="None" if is_production else "Lax",
    SESSION_COOKIE_SECURE=True if is_production else False,
    SESSION_COOKIE_HTTPONLY=True
)

# Nếu không có DATABASE_URL thì dùng SQLite local
if os.getenv("DATABASE_URL"):
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
else:
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///local.db"

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
    # Nếu dùng SQLite, tự động tạo bảng và dữ liệu mẫu nếu chưa có
    with app.app_context():
        db.create_all()
        from models import Restaurant, MenuItem, Tag, RestaurantImage, AdminUser
        
        # Luôn tạo admin user nếu chưa tồn tại
        admin_exists = AdminUser.query.filter_by(email="phattran280704@gmail.com").first()
        if not admin_exists:
            admin = AdminUser(
                email="phattran280704@gmail.com",
                password_hash=generate_password_hash("admin123"),
                is_active=True
            )
            db.session.add(admin)
            db.session.commit()
            print("✓ Admin user đã tạo: phattran280704@gmail.com / admin123")
        
        # Thêm dữ liệu mẫu restaurant nếu chưa có
        if not Restaurant.query.first():
            tag1 = Tag(name="Món Việt", icon="🍜", color="#ff9800", description="Ẩm thực Việt Nam")
            tag2 = Tag(name="Ăn nhanh", icon="🍔", color="#4caf50", description="Đồ ăn nhanh")
            db.session.add_all([tag1, tag2])
            db.session.commit()

            r1 = Restaurant(name="Phở 24", lat=10.762622, lng=106.660172, description="Phở bò truyền thống", avg_eat_time=20, is_active=True)
            r2 = Restaurant(name="Burger King", lat=10.762700, lng=106.660200, description="Burger & Fastfood", avg_eat_time=15, is_active=True)
            r1.tags.append(tag1)
            r2.tags.append(tag2)
            db.session.add_all([r1, r2])
            db.session.commit()

            m1 = MenuItem(name="Phở bò đặc biệt", price=50000, restaurant_id=r1.id)
            m2 = MenuItem(name="Burger bò", price=45000, restaurant_id=r2.id)
            db.session.add_all([m1, m2])
            db.session.commit()

            img1 = RestaurantImage(restaurant_id=r1.id, image_url="https://images.unsplash.com/photo-1", caption="Phở bò", display_order=1, is_primary=True)
            img2 = RestaurantImage(restaurant_id=r2.id, image_url="https://images.unsplash.com/photo-2", caption="Burger", display_order=1, is_primary=True)
            db.session.add_all([img1, img2])
            db.session.commit()

            print("✓ Đã tạo dữ liệu mẫu cho SQLite!")

    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))


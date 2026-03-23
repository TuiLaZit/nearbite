from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from db import db
from sqlalchemy import inspect, text
import os
import re
import time
import threading
from routes.user import register_user_routes
from routes.admin import register_admin_routes
from translate import prewarm_translation_cache, LANGUAGE_LABELS, cleanup_expired_translation_cache
from tts import cleanup_expired_tts_cache
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


def _is_true_env(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_production_environment():
    # Railway does not set RENDER, so rely on common production indicators.
    if _is_true_env(os.getenv("RENDER")):
        return True
    if _is_true_env(os.getenv("RAILWAY_ENVIRONMENT")):
        return True
    if os.getenv("RAILWAY_PROJECT_ID"):
        return True
    if any(key.startswith("RAILWAY_") for key in os.environ.keys()):
        return True
    if os.getenv("PORT") and not _is_true_env(os.getenv("LOCAL_DEV")):
        return True

    flask_env = str(os.getenv("FLASK_ENV") or "").strip().lower()
    app_env = str(os.getenv("APP_ENV") or "").strip().lower()
    return flask_env == "production" or app_env == "production"


is_production = _is_production_environment()


def _build_allowed_origins():
    origins = [
        # Local development
        "http://127.0.0.1:5000",
        "http://localhost:5000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        # Production
        "https://nearbite.vercel.app",
        r"https://.*\.vercel\.app",
    ]

    extra_origins = (os.getenv("CORS_ALLOWED_ORIGINS") or "").strip()
    if extra_origins:
        origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

    return origins


ALLOWED_ORIGINS = _build_allowed_origins()


def _is_origin_allowed(origin):
    if not origin:
        return False

    for pattern in ALLOWED_ORIGINS:
        if pattern == origin:
            return True
        if pattern.startswith("https://.*") and re.fullmatch(pattern, origin):
            return True
    return False


def _normalize_database_url(raw_url):
    url = (raw_url or "").strip()
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url

CORS(
    app,
    resources={r"/*": {
        "origins": ALLOWED_ORIGINS
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
        if not _is_origin_allowed(origin):
            return jsonify({"error": "Origin not allowed"}), 403

        response = jsonify({"status": "ok"})
        response.headers.add("Access-Control-Allow-Origin", origin)
        response.headers.add("Access-Control-Allow-Credentials", "true")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
        response.headers.add("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        return response, 200

app.config.update(
    SESSION_COOKIE_SAMESITE="None" if is_production else "Lax",
    SESSION_COOKIE_SECURE=True if is_production else False,
    SESSION_COOKIE_HTTPONLY=True
)

app.config["SQLALCHEMY_DATABASE_URI"] = _normalize_database_url(os.getenv("DATABASE_URL"))
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

_prewarm_started = False
_prewarm_lock = threading.Lock()
_cache_cleanup_lock = threading.Lock()
_cache_cleanup_started = False
_cache_cleanup_started_lock = threading.Lock()
_cleanup_interval_seconds = int((os.getenv("CACHE_CLEANUP_INTERVAL_SECONDS") or "600").strip() or "600")
_cleanup_interval_seconds = max(60, min(3600, _cleanup_interval_seconds))
_last_cleanup_monotonic = 0.0
_cleanup_translation_limit = int((os.getenv("CACHE_CLEANUP_TRANSLATION_LIMIT") or "1000").strip() or "1000")
_cleanup_translation_limit = max(100, min(10000, _cleanup_translation_limit))
_cleanup_tts_limit = int((os.getenv("CACHE_CLEANUP_TTS_LIMIT") or "200").strip() or "200")
_cleanup_tts_limit = max(50, min(2000, _cleanup_tts_limit))
_cleanup_tts_batches = int((os.getenv("CACHE_CLEANUP_TTS_BATCHES") or "10").strip() or "10")
_cleanup_tts_batches = max(1, min(100, _cleanup_tts_batches))
_cleanup_translation_batches = int((os.getenv("CACHE_CLEANUP_TRANSLATION_BATCHES") or "5").strip() or "5")
_cleanup_translation_batches = max(1, min(100, _cleanup_translation_batches))


def _run_cache_cleanup(reason="manual"):
    if not _cache_cleanup_lock.acquire(blocking=False):
        return None

    try:
        translation_deleted = cleanup_expired_translation_cache(
            limit=_cleanup_translation_limit,
            max_batches=_cleanup_translation_batches,
        )
        tts_deleted = cleanup_expired_tts_cache(
            limit=_cleanup_tts_limit,
            max_batches=_cleanup_tts_batches,
        )
        stats = {
            "reason": reason,
            "translation_deleted": int(translation_deleted or 0),
            "tts_deleted": int(tts_deleted or 0),
        }
        if stats["translation_deleted"] > 0 or stats["tts_deleted"] > 0:
            print(f"[cache-cleanup] {stats}")
        return stats
    finally:
        _cache_cleanup_lock.release()


def _start_periodic_cache_cleanup_worker():
    global _cache_cleanup_started
    with _cache_cleanup_started_lock:
        if _cache_cleanup_started:
            return
        _cache_cleanup_started = True

    def _run_forever():
        while True:
            try:
                time.sleep(_cleanup_interval_seconds)
                _run_cache_cleanup(reason="periodic")
            except Exception as exc:
                print(f"[cache-cleanup] periodic worker error: {exc}")

    threading.Thread(target=_run_forever, daemon=True).start()


def _extract_translation_texts_for_prewarm():
    keys_file = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "translationKeys.js")
    )
    if not os.path.exists(keys_file):
        return []

    try:
        with open(keys_file, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return []

    # Extract object values from lines like: key: 'Giá trị'
    matches = re.findall(r":\s*'((?:\\'|[^'])*)'", content)

    texts = []
    seen = set()
    for raw in matches:
        text = raw.replace("\\'", "'").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        texts.append(text)

    return texts


def _start_translation_prewarm_worker():
    global _prewarm_started

    with _prewarm_lock:
        if _prewarm_started:
            return

    enabled_env = (os.getenv("PREWARM_TRANSLATIONS") or "").strip().lower()
    # Default behavior:
    # - production: enabled
    # - local: disabled (can opt-in by PREWARM_TRANSLATIONS=true)
    if enabled_env in {"0", "false", "no", "off"}:
        return
    if not is_production and enabled_env not in {"1", "true", "yes", "on"}:
        return

    langs_env = (os.getenv("PREWARM_LANGS") or "").strip()
    if langs_env:
        target_langs = [lang.strip() for lang in langs_env.split(",") if lang.strip()]
    else:
        target_langs = [code for code in LANGUAGE_LABELS.keys() if code != "vi"]

    # Keep only supported and unique language codes, preserving order.
    seen_langs = set()
    filtered_langs = []
    for code in target_langs:
        if code == "vi" or code not in LANGUAGE_LABELS or code in seen_langs:
            continue
        seen_langs.add(code)
        filtered_langs.append(code)

    target_langs = filtered_langs
    texts = _extract_translation_texts_for_prewarm()
    if not texts or not target_langs:
        return

    def _run_prewarm():
        try:
            prewarm_translation_cache(texts, target_langs)
            print(f"[prewarm] Completed for {len(target_langs)} languages, {len(texts)} texts")
        except Exception as exc:
            print(f"[prewarm] Failed: {exc}")

    _prewarm_started = True
    threading.Thread(target=_run_prewarm, daemon=True).start()


def _start_cache_cleanup_worker_if_needed():
    global _last_cleanup_monotonic
    now = time.monotonic()
    if now - _last_cleanup_monotonic < _cleanup_interval_seconds:
        return
    _last_cleanup_monotonic = now

    def _run_cleanup_async():
        _run_cache_cleanup(reason="request-throttled")

    threading.Thread(target=_run_cleanup_async, daemon=True).start()


@app.before_request
def _ensure_prewarm_started_once():
    if request.method == "OPTIONS":
        return None
    _start_translation_prewarm_worker()
    _start_periodic_cache_cleanup_worker()
    _start_cache_cleanup_worker_if_needed()
    return None

# Auto create missing tables in local development so new features can run
# without manual migration steps.
auto_create_tables_env = (os.getenv("AUTO_CREATE_TABLES") or "").strip().lower()
if auto_create_tables_env:
    auto_create_tables = auto_create_tables_env in {"1", "true", "yes", "on"}
else:
    auto_create_tables = not bool(is_production)

if auto_create_tables:
    try:
        with app.app_context():
            db.create_all()
    except Exception as exc:
        # Never crash app startup due to best-effort local table bootstrap.
        print(f"[startup] Skipped db.create_all(): {exc}")


def _ensure_local_schema_compatibility():
    """Best-effort local schema patching for drift between models and DB."""
    if is_production:
        return

    try:
        inspector = inspect(db.engine)
        tables = set(inspector.get_table_names())
        if "admin_user" not in tables:
            return

        columns = {col["name"] for col in inspector.get_columns("admin_user")}
        if "password_hash" not in columns:
            db.session.execute(text("ALTER TABLE admin_user ADD COLUMN password_hash VARCHAR(255)"))
            db.session.commit()
            print("[local-schema] Added missing column admin_user.password_hash")
    except Exception as exc:
        db.session.rollback()
        print(f"[local-schema] Compatibility patch skipped: {exc}")


def _ensure_cache_tables():
    """Create cache tables used by translation/TTS persistent cache."""
    statements = [
        """
        CREATE TABLE IF NOT EXISTS translation_cache_entry (
            id BIGSERIAL PRIMARY KEY,
            cache_key VARCHAR(255) UNIQUE NOT NULL,
            restaurant_id INTEGER NULL,
            target_lang VARCHAR(16) NOT NULL,
            source_text TEXT NOT NULL,
            translated_text TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_translation_cache_key
            ON translation_cache_entry(cache_key)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_translation_cache_restaurant
            ON translation_cache_entry(restaurant_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_translation_cache_expires
            ON translation_cache_entry(expires_at)
        """,
        """
        CREATE TABLE IF NOT EXISTS tts_cache_entry (
            id BIGSERIAL PRIMARY KEY,
            cache_key VARCHAR(255) UNIQUE NOT NULL,
            restaurant_id INTEGER NULL,
            language_code VARCHAR(16) NOT NULL,
            text_hash VARCHAR(64) NOT NULL,
            storage_path TEXT NOT NULL,
            public_url TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_tts_cache_key
            ON tts_cache_entry(cache_key)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_tts_cache_restaurant
            ON tts_cache_entry(restaurant_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_tts_cache_expires
            ON tts_cache_entry(expires_at)
        """,
    ]

    try:
        for statement in statements:
            db.session.execute(text(statement))
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print(f"[cache-schema] Ensure cache tables skipped: {exc}")


with app.app_context():
    _ensure_cache_tables()
    _ensure_local_schema_compatibility()


@app.route("/healthz")
def healthz():
    return jsonify({"status": "ok"}), 200


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
_start_translation_prewarm_worker()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))


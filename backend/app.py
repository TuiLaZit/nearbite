from flask import Flask, jsonify, send_from_directory, request, Response, session
from flask_cors import CORS
from db import db
from sqlalchemy import inspect, text
import os
import re
import time
import threading
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from routes.user import register_user_routes
from routes.admin import register_admin_routes
from translate import prewarm_translation_cache, cleanup_expired_translation_cache
from tts import cleanup_expired_tts_cache
from cache_warmup import prewarm_all_restaurants_content, resolve_target_languages
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
    SESSION_COOKIE_HTTPONLY=True,
    # Improve auth reliability for installed PWA when frontend/backend are on different origins.
    # Browsers can block classic third-party cookies; Partitioned cookies (CHIPS) help preserve
    # session cookies in cross-site requests while keeping isolation per top-level site.
    SESSION_COOKIE_PARTITIONED=(
        is_production and _is_true_env(os.getenv("SESSION_COOKIE_PARTITIONED", "true"))
    ),
)

app.config["SQLALCHEMY_DATABASE_URI"] = _normalize_database_url(os.getenv("DATABASE_URL"))
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

_prewarm_started = False
_prewarm_lock = threading.Lock()
_cache_cleanup_lock = threading.Lock()
_cache_cleanup_started = False
_cache_cleanup_started_lock = threading.Lock()
_cache_cleanup_enabled = _is_true_env(os.getenv("CACHE_CLEANUP_ENABLED", "false"))
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


MAP_TILE_PROVIDERS = {
    "carto-voyager": "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    "osm": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "opentopo": "https://tile.opentopomap.org/{z}/{x}/{y}.png",
}


# Dynamic QR token state (global, on-demand rotation, no DB dependency).
QR_TOKEN_TTL_HOURS = 2
_qr_state_lock = threading.Lock()
_qr_current_token = None
_qr_expires_at = None


def _utc_now():
    return datetime.now(timezone.utc)


def _to_iso8601(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def _is_qr_expired(expires_at):
    if not expires_at:
        return True
    return _utc_now() >= expires_at


def _issue_qr_token_locked():
    global _qr_current_token, _qr_expires_at
    _qr_current_token = str(uuid4())
    _qr_expires_at = _utc_now() + timedelta(hours=QR_TOKEN_TTL_HOURS)
    return _qr_current_token, _qr_expires_at


def _get_qr_token_state():
    with _qr_state_lock:
        if not _qr_current_token or _is_qr_expired(_qr_expires_at):
            return _issue_qr_token_locked()
        return _qr_current_token, _qr_expires_at


def _force_expire_qr_token():
    global _qr_expires_at
    with _qr_state_lock:
        if not _qr_current_token:
            _issue_qr_token_locked()
        _qr_expires_at = _utc_now() - timedelta(seconds=1)
        return _qr_current_token, _qr_expires_at


def _validate_qr_token(candidate_token):
    token = str(candidate_token or "").strip()
    if not token:
        return False

    with _qr_state_lock:
        if not _qr_current_token or _is_qr_expired(_qr_expires_at):
            return False
        return token == _qr_current_token


def _is_qr_manager_logged_in():
    return bool(session.get("owner_logged_in") or session.get("admin_logged_in"))


def _has_valid_qr_session_access():
    with _qr_state_lock:
        if not _qr_current_token or _is_qr_expired(_qr_expires_at):
            return False

        session_token = str(session.get("qr_access_token") or "").strip()
        if not session_token:
            return False
        return session_token == _qr_current_token


def _run_cache_cleanup(reason="manual"):
    if not _cache_cleanup_enabled:
        return {
            "reason": reason,
            "translation_deleted": 0,
            "tts_deleted": 0,
            "disabled": True,
        }

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
    if not _cache_cleanup_enabled:
        return

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

    target_langs = resolve_target_languages()
    texts = _extract_translation_texts_for_prewarm()
    if not target_langs:
        return

    prewarm_restaurant_env = (os.getenv("PREWARM_RESTAURANTS") or "").strip().lower()
    if prewarm_restaurant_env in {"0", "false", "no", "off"}:
        prewarm_restaurants = False
    elif prewarm_restaurant_env in {"1", "true", "yes", "on"}:
        prewarm_restaurants = True
    else:
        prewarm_restaurants = True

    def _run_prewarm():
        try:
            if texts:
                prewarm_translation_cache(texts, target_langs)
                print(f"[prewarm] UI translations ready for {len(target_langs)} languages, {len(texts)} texts")

            if prewarm_restaurants:
                with app.app_context():
                    stats = prewarm_all_restaurants_content(
                        target_langs=target_langs,
                        clear_existing=False,
                        only_active=True,
                    )
                print(f"[prewarm] Restaurant content ready: {stats}")
        except Exception as exc:
            print(f"[prewarm] Failed: {exc}")

    _prewarm_started = True
    threading.Thread(target=_run_prewarm, daemon=True).start()


def _start_cache_cleanup_worker_if_needed():
    if not _cache_cleanup_enabled:
        return

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
            note TEXT NULL,
            logical_key TEXT NULL,
            source_checksum VARCHAR(64) NULL,
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
        CREATE INDEX IF NOT EXISTS idx_translation_cache_scope_lang_note
            ON translation_cache_entry(restaurant_id, target_lang, note)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_translation_cache_global_lang_note
            ON translation_cache_entry(target_lang, note)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_translation_cache_logical
            ON translation_cache_entry(restaurant_id, target_lang, note, logical_key)
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


def _ensure_translation_cache_catalog_columns():
    """Ensure catalog columns exist for older schemas."""
    try:
        db.session.execute(
            text("ALTER TABLE IF EXISTS translation_cache_entry ADD COLUMN IF NOT EXISTS note TEXT")
        )
        db.session.execute(
            text("ALTER TABLE IF EXISTS translation_cache_entry ADD COLUMN IF NOT EXISTS logical_key TEXT")
        )
        db.session.execute(
            text("ALTER TABLE IF EXISTS translation_cache_entry ADD COLUMN IF NOT EXISTS source_checksum VARCHAR(64)")
        )
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print(f"[cache-schema] Ensure translation catalog columns skipped: {exc}")


def _ensure_user_activity_heatmap_schema():
    """Ensure heartbeat tables/columns needed by realtime heatmap exist."""
    statements = [
        """
        CREATE TABLE IF NOT EXISTS user_activity (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id text NOT NULL,
            user_id uuid NULL,
            last_seen timestamptz NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_device_id_unique
            ON user_activity(device_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_user_activity_last_seen
            ON user_activity(last_seen DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_user_activity_user_last_seen
            ON user_activity(user_id, last_seen DESC)
            WHERE user_id IS NOT NULL
        """,
        """
        ALTER TABLE IF EXISTS user_activity
        ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL
        """,
        """
        ALTER TABLE IF EXISTS user_activity
        ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL
        """,
        """
        ALTER TABLE IF EXISTS user_activity
        ADD COLUMN IF NOT EXISTS user_identity TEXT NULL
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_user_activity_identity_last_seen
            ON user_activity(user_identity, last_seen DESC)
            WHERE user_identity IS NOT NULL
        """,
        """
        CREATE TABLE IF NOT EXISTS user_activity_heatmap_cell (
            lat_bucket DOUBLE PRECISION NOT NULL,
            lng_bucket DOUBLE PRECISION NOT NULL,
            hit_count BIGINT NOT NULL DEFAULT 0,
            last_seen timestamptz NOT NULL DEFAULT NOW(),
            PRIMARY KEY (lat_bucket, lng_bucket)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_user_activity_heatmap_cell_hits
            ON user_activity_heatmap_cell(hit_count DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_user_activity_heatmap_cell_last_seen
            ON user_activity_heatmap_cell(last_seen DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS user_activity_heatmap_device_state (
            device_id text PRIMARY KEY,
            user_id uuid NULL,
            last_counted_at timestamptz NULL,
            last_lat DOUBLE PRECISION NULL,
            last_lng DOUBLE PRECISION NULL,
            updated_at timestamptz NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_user_activity_heatmap_device_state_updated
            ON user_activity_heatmap_device_state(updated_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_user_activity_heatmap_device_state_user
            ON user_activity_heatmap_device_state(user_id)
            WHERE user_id IS NOT NULL
        """,
    ]

    try:
        for statement in statements:
            db.session.execute(text(statement))
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print(f"[user-activity-schema] Ensure heartbeat heatmap schema skipped: {exc}")


def _cleanup_legacy_scoped_translation_cache_rows():
    """
    Remove legacy duplicated rows that were scoped by restaurant for generic texts.
    Keep restaurant-specific caches for narration/proximity note categories.
    """
    cleanup_enabled = _is_true_env(os.getenv("TRANSLATION_CACHE_CLEANUP_LEGACY_SCOPED", "true"))
    if not cleanup_enabled:
        return

    cleanup_limit = int((os.getenv("TRANSLATION_CACHE_CLEANUP_LIMIT") or "5000").strip() or "5000")
    cleanup_limit = max(100, min(50000, cleanup_limit))

    protected_texts_env = (os.getenv("TRANSLATION_CACHE_PROTECTED_TEXTS") or "").strip()
    protected_texts = {
        "Đăng nhập",
        "Đăng xuất",
        "Bắt Đầu Theo Dõi",
        "Dừng Theo Dõi",
        "Nghe",
        "Nghe thuyết minh",
        "Chỉ đường",
        "Xem menu",
    }
    if protected_texts_env:
        protected_texts.update({text.strip() for text in protected_texts_env.split("|") if text.strip()})

    try:
        candidate_rows = db.session.execute(
            text(
                """
                SELECT id, source_text
                FROM translation_cache_entry
                WHERE restaurant_id IS NOT NULL
                  AND COALESCE(note, '') NOT IN ('restaurant_narration', 'restaurant_proximity_hint')
                ORDER BY updated_at ASC NULLS FIRST, id ASC
                LIMIT :cleanup_limit
                """
            ),
            {"cleanup_limit": cleanup_limit}
        ).mappings().all()

        delete_ids = []
        for row in candidate_rows:
            source_text = str((row or {}).get("source_text") or "").strip()
            if source_text in protected_texts:
                continue
            delete_ids.append(int(row.get("id")))

        deleted_count = 0
        if delete_ids:
            deleted = db.session.execute(
                text(
                    """
                    DELETE FROM translation_cache_entry
                    WHERE id = ANY(:delete_ids)
                    RETURNING id
                    """
                ),
                {"delete_ids": delete_ids}
            ).fetchall() or []
            deleted_count = len(deleted)

        db.session.commit()
        if deleted_count > 0:
            print(f"[cache-cleanup] Removed {deleted_count} legacy scoped translation cache rows")
    except Exception as exc:
        db.session.rollback()
        print(f"[cache-cleanup] Legacy scoped translation cleanup skipped: {exc}")


def _resolve_deploy_marker():
    return (
        (os.getenv("CACHE_DEPLOY_MARKER") or "").strip()
        or (os.getenv("RENDER_GIT_COMMIT") or "").strip()
        or (os.getenv("RAILWAY_GIT_COMMIT_SHA") or "").strip()
    )


def _refresh_translation_cache_on_redeploy():
    """
    If deploy marker changes, clear translation cache so prewarm/build can rewrite
    fresh values and avoid stale rows from previous deploy versions.
    """
    enabled = _is_true_env(os.getenv("TRANSLATION_REFRESH_ON_REDEPLOY", "false"))
    if not enabled:
        return

    deploy_marker = _resolve_deploy_marker()
    if not deploy_marker:
        return

    try:
        db.session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS app_runtime_meta (
                    meta_key TEXT PRIMARY KEY,
                    meta_value TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )

        row = db.session.execute(
            text(
                "SELECT meta_value FROM app_runtime_meta WHERE meta_key = 'translation_cache_deploy_marker' LIMIT 1"
            )
        ).mappings().first()

        last_marker = (row or {}).get("meta_value")
        if last_marker == deploy_marker:
            db.session.commit()
            return

        deleted_rows = db.session.execute(
            text("DELETE FROM translation_cache_entry RETURNING id")
        ).fetchall() or []

        db.session.execute(
            text(
                """
                INSERT INTO app_runtime_meta (meta_key, meta_value, updated_at)
                VALUES ('translation_cache_deploy_marker', :deploy_marker, NOW())
                ON CONFLICT (meta_key)
                DO UPDATE SET meta_value = EXCLUDED.meta_value, updated_at = NOW()
                """
            ),
            {"deploy_marker": deploy_marker}
        )
        db.session.commit()
        print(
            "[cache-refresh] Deploy marker changed. "
            f"Cleared translation cache rows={len(deleted_rows)} marker={deploy_marker[:12]}"
        )
    except Exception as exc:
        db.session.rollback()
        print(f"[cache-refresh] Redeploy refresh skipped: {exc}")


def _run_startup_db_bootstrap():
    """
    Run DB bootstrap tasks with best-effort semantics.
    Keep failures non-fatal so app can still serve health checks.
    """
    try:
        with app.app_context():
            _ensure_cache_tables()
            _ensure_translation_cache_catalog_columns()
            _ensure_user_activity_heatmap_schema()
            _refresh_translation_cache_on_redeploy()
            _cleanup_legacy_scoped_translation_cache_rows()
            _ensure_local_schema_compatibility()
    except Exception as exc:
        print(f"[startup] DB bootstrap skipped: {exc}")


def _start_startup_db_bootstrap():
    # Default async on production to avoid blocking platform health checks.
    sync_bootstrap = _is_true_env(os.getenv("STARTUP_SCHEMA_SYNC", "false"))
    if sync_bootstrap:
        _run_startup_db_bootstrap()
        return

    threading.Thread(target=_run_startup_db_bootstrap, daemon=True).start()


_start_startup_db_bootstrap()


@app.route("/healthz")
def healthz():
    return jsonify({"status": "ok"}), 200


@app.route("/qr/current", methods=["GET"])
@app.route("/api/qr/current", methods=["GET"])
def get_current_qr_token():
    if not _is_qr_manager_logged_in():
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    token, expires_at = _get_qr_token_state()
    return jsonify({
        "token": token,
        "expires_at": _to_iso8601(expires_at),
        "ttl_hours": QR_TOKEN_TTL_HOURS,
    }), 200


@app.route("/qr/force-expire", methods=["POST"])
@app.route("/api/qr/force-expire", methods=["POST"])
def force_expire_qr_token():
    if not _is_qr_manager_logged_in():
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    _, expires_at = _force_expire_qr_token()
    session.pop("qr_access_token", None)
    return jsonify({
        "status": "success",
        "message": "QR token marked as expired",
        "expires_at": _to_iso8601(expires_at),
    }), 200


@app.route("/qr/entry", methods=["GET"])
@app.route("/api/qr/entry", methods=["GET"])
def validate_qr_entry():
    token = request.args.get("token", "")
    if _validate_qr_token(token):
        session["qr_access_token"] = str(token).strip()
        return jsonify({"status": "success", "message": "Access granted"}), 200

    return jsonify({"status": "error", "message": "QR expired hoặc không hợp lệ"}), 401


@app.route("/qr/access-check", methods=["GET"])
@app.route("/api/qr/access-check", methods=["GET"])
def qr_access_check():
    if _has_valid_qr_session_access():
        return jsonify({"status": "success", "message": "QR access granted"}), 200

    session.pop("qr_access_token", None)
    return jsonify({"status": "error", "message": "QR access required"}), 401


@app.route("/map-tiles/<provider>/<int:z>/<int:x>/<int:y>.png", methods=["GET"])
@app.route("/api/map-tiles/<provider>/<int:z>/<int:x>/<int:y>.png", methods=["GET"])
def proxy_map_tiles(provider, z, x, y):
    provider_template = MAP_TILE_PROVIDERS.get(provider)
    if not provider_template:
        return jsonify({"error": "Unknown map tile provider"}), 404

    if z < 0 or z > 22 or x < 0 or y < 0:
        return jsonify({"error": "Invalid tile coordinates"}), 400

    upstream_url = provider_template.format(z=z, x=x, y=y)
    upstream_request = Request(
        upstream_url,
        headers={
            "User-Agent": "NearBiteMapProxy/1.0",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
    )

    try:
        with urlopen(upstream_request, timeout=8) as upstream_response:
            body = upstream_response.read()
            content_type = upstream_response.headers.get("Content-Type", "image/png")
            response = Response(body, status=200, content_type=content_type)
            response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
            response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
            return response
    except HTTPError as exc:
        return Response(status=int(exc.code or 502))
    except (URLError, TimeoutError):
        return Response(status=504)
    except Exception:
        return Response(status=502)


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


import os
import hashlib
import re
from io import BytesIO
from datetime import datetime, timedelta, timezone
from gtts import gTTS
from supabase_client import supabase_client, ensure_bucket_exists, get_public_url_for_path

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.path.join(BASE_DIR, "static", "tts")
MAX_FILES = 100  # Số file audio tối đa
CLEANUP_COUNT = 50  # Số file sẽ xóa khi đạt giới hạn
TTS_BUCKET = (os.getenv("TTS_BUCKET") or "tts-audio").strip() or "tts-audio"
TTS_TABLE = (os.getenv("TTS_CACHE_TABLE") or "tts_cache_entry").strip() or "tts_cache_entry"
TTS_CACHE_TTL_SECONDS = int((os.getenv("TTS_CACHE_TTL_SECONDS") or "3600").strip() or "3600")
TTS_CACHE_TTL_SECONDS = max(60, min(86400, TTS_CACHE_TTL_SECONDS))
_IN_MEMORY_TTS_CACHE = {}

# Map language codes để tương thích với gTTS
TTS_LANG_MAP = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    "zh": "zh-CN",
    "ms": "ms",
    "id": "id",
    "th": "th",
    "ko": "ko",
    "ja": "ja",
    "ru": "ru",
    "de": "de",
    "fr": "fr",
    "es": "es",
    "it": "it",
    "en": "en",
    "vi": "vi"
}

def cleanup_old_files():
    """Xóa các file audio cũ nhất khi vượt quá giới hạn"""
    try:
        files = [f for f in os.listdir(TTS_DIR) if f.endswith('.mp3')]
        if len(files) > MAX_FILES:
            # Sắp xếp theo thời gian sửa đổi (cũ nhất trước)
            files_with_time = [(f, os.path.getmtime(os.path.join(TTS_DIR, f))) for f in files]
            files_sorted = sorted(files_with_time, key=lambda x: x[1])
            
            # Xóa các file cũ nhất
            for i in range(CLEANUP_COUNT):
                if i < len(files_sorted):
                    file_to_remove = os.path.join(TTS_DIR, files_sorted[i][0])
                    os.remove(file_to_remove)
    except Exception as e:
        pass


def _utc_now():
    return datetime.now(timezone.utc)


def _utc_now_iso():
    return _utc_now().isoformat()


def _expires_at_iso(ttl_seconds):
    return (_utc_now() + timedelta(seconds=ttl_seconds)).isoformat()


def _persistent_key(text, mapped_lang, restaurant_id=None):
    scope = str(restaurant_id) if restaurant_id is not None else "global"
    source = f"{scope}::{mapped_lang}::{text}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _storage_path_for_hash(text_hash, mapped_lang, restaurant_id=None):
    scope = f"restaurant-{restaurant_id}" if restaurant_id is not None else "global"
    return f"{scope}/{mapped_lang}/{text_hash}.mp3"


def _generate_tts_bytes(text, mapped_lang):
    audio_buffer = BytesIO()
    try:
        gTTS(text=text, lang=mapped_lang, slow=False, tld='com').write_to_fp(audio_buffer)
    except Exception:
        # Fallback: tạo TTS tiếng Việt
        audio_buffer = BytesIO()
        gTTS(text=text, lang="vi", slow=False, tld='com').write_to_fp(audio_buffer)
    return audio_buffer.getvalue()


def _extract_http_url(value):
    if not isinstance(value, str):
        return None
    match = re.search(r"https?://[^\s\"'}]+", value)
    return match.group(0) if match else None


def _normalize_cached_audio_url(raw_value, storage_path=None):
    if isinstance(raw_value, str):
        value = raw_value.strip()
        if not value:
            value = ""
        if value.startswith("http://") or value.startswith("https://"):
            return value
        if value.startswith("//"):
            return f"https:{value}"
        embedded = _extract_http_url(value)
        if embedded:
            return embedded
        if value.startswith("/"):
            return value

    if storage_path:
        return get_public_url_for_path(storage_path, bucket_name=TTS_BUCKET)

    return None


def _persistent_tts_get(cache_key):
    if not supabase_client:
        return None

    try:
        response = (
            supabase_client
            .table(TTS_TABLE)
            .select("id,public_url,storage_path,expires_at")
            .eq("cache_key", cache_key)
            .gt("expires_at", _utc_now_iso())
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if rows:
            row = rows[0]
            normalized_url = _normalize_cached_audio_url(
                row.get("public_url"),
                storage_path=row.get("storage_path")
            )
            if not normalized_url:
                try:
                    supabase_client.table(TTS_TABLE).delete().eq("id", row.get("id")).execute()
                except Exception:
                    pass
                return None

            if normalized_url != row.get("public_url"):
                try:
                    supabase_client.table(TTS_TABLE).update({
                        "public_url": normalized_url,
                        "updated_at": _utc_now_iso(),
                    }).eq("id", row.get("id")).execute()
                except Exception:
                    pass

            return normalized_url
    except Exception:
        return None

    return None


def _persistent_tts_set(cache_key, restaurant_id, mapped_lang, text_hash, storage_path, public_url, ttl_seconds):
    if not supabase_client:
        return

    try:
        payload = {
            "cache_key": cache_key,
            "restaurant_id": restaurant_id,
            "language_code": mapped_lang,
            "text_hash": text_hash,
            "storage_path": storage_path,
            "public_url": public_url,
            "expires_at": _expires_at_iso(ttl_seconds),
            "updated_at": _utc_now_iso(),
        }
        supabase_client.table(TTS_TABLE).upsert(payload, on_conflict="cache_key").execute()
    except Exception:
        return


def invalidate_tts_cache(restaurant_id=None):
    """Invalidate TTS cache globally or by restaurant scope."""
    try:
        if restaurant_id is None:
            _IN_MEMORY_TTS_CACHE.clear()
        else:
            prefix = f"{restaurant_id}::"
            stale = [key for key in _IN_MEMORY_TTS_CACHE.keys() if key.startswith(prefix)]
            for key in stale:
                _IN_MEMORY_TTS_CACHE.pop(key, None)
    except Exception:
        pass

    if not supabase_client:
        return

    try:
        query = supabase_client.table(TTS_TABLE).select("storage_path")
        if restaurant_id is None:
            query = query.gte("id", 0)
        else:
            query = query.eq("restaurant_id", int(restaurant_id))
        rows = (query.execute().data or [])
        paths = [row.get("storage_path") for row in rows if row.get("storage_path")]
        if paths:
            ensure_bucket_exists(TTS_BUCKET)
            supabase_client.storage.from_(TTS_BUCKET).remove(paths)

        delete_query = supabase_client.table(TTS_TABLE).delete()
        if restaurant_id is None:
            delete_query = delete_query.gte("id", 0)
        else:
            delete_query = delete_query.eq("restaurant_id", int(restaurant_id))
        delete_query.execute()
    except Exception:
        return


def cleanup_expired_tts_cache(limit=200):
    if not supabase_client:
        return

    try:
        rows = (
            supabase_client
            .table(TTS_TABLE)
            .select("id,storage_path")
            .lt("expires_at", _utc_now_iso())
            .limit(max(1, int(limit)))
            .execute()
            .data
            or []
        )
        if not rows:
            return

        paths = [row.get("storage_path") for row in rows if row.get("storage_path")]
        if paths:
            ensure_bucket_exists(TTS_BUCKET)
            supabase_client.storage.from_(TTS_BUCKET).remove(paths)

        row_ids = [row.get("id") for row in rows if row.get("id") is not None]
        if row_ids:
            supabase_client.table(TTS_TABLE).delete().in_("id", row_ids).execute()
    except Exception:
        return


def text_to_speech(text, lang, restaurant_id=None, ttl_seconds=None):
    os.makedirs(TTS_DIR, exist_ok=True)
    ttl = TTS_CACHE_TTL_SECONDS if ttl_seconds is None else max(60, int(ttl_seconds))

    # Map language code cho gTTS
    mapped_lang = TTS_LANG_MAP.get(lang, "vi")

    # Tạo filename/cache key dựa trên text + language + scope
    hash_input = f"{text}_{mapped_lang}".encode('utf-8')
    file_hash = hashlib.md5(hash_input).hexdigest()
    filename = f"{file_hash}.mp3"
    filepath = os.path.join(TTS_DIR, filename)
    scope = str(restaurant_id) if restaurant_id is not None else "global"
    memory_cache_key = f"{scope}::{mapped_lang}::{file_hash}"

    cached_url = _IN_MEMORY_TTS_CACHE.get(memory_cache_key)
    if cached_url:
        return cached_url

    if supabase_client:
        persistent_key = _persistent_key(text, mapped_lang, restaurant_id=restaurant_id)
        persistent_url = _persistent_tts_get(persistent_key)
        if persistent_url:
            _IN_MEMORY_TTS_CACHE[memory_cache_key] = persistent_url
            return persistent_url

    # Nếu file đã tồn tại, trả về luôn không cần tạo lại
    if os.path.exists(filepath):
        local_url = f"/static/tts/{filename}"
        _IN_MEMORY_TTS_CACHE[memory_cache_key] = local_url
        return local_url

    # Cleanup nếu cần
    cleanup_old_files()

    try:
        audio_bytes = _generate_tts_bytes(text, mapped_lang)

        if supabase_client:
            ensure_bucket_exists(TTS_BUCKET)
            storage_path = _storage_path_for_hash(file_hash, mapped_lang, restaurant_id=restaurant_id)
            supabase_client.storage.from_(TTS_BUCKET).upload(
                storage_path,
                audio_bytes,
                {
                    "content-type": "audio/mpeg",
                    "upsert": True,
                    "cache-control": str(ttl),
                }
            )
            public_url = get_public_url_for_path(storage_path, bucket_name=TTS_BUCKET)
            if not public_url:
                raise Exception("Unable to resolve public URL for generated TTS audio")
            persistent_key = _persistent_key(text, mapped_lang, restaurant_id=restaurant_id)
            _persistent_tts_set(
                cache_key=persistent_key,
                restaurant_id=restaurant_id,
                mapped_lang=mapped_lang,
                text_hash=file_hash,
                storage_path=storage_path,
                public_url=public_url,
                ttl_seconds=ttl,
            )
            _IN_MEMORY_TTS_CACHE[memory_cache_key] = public_url
            return public_url

        with open(filepath, "wb") as f:
            f.write(audio_bytes)
        local_url = f"/static/tts/{filename}"
        _IN_MEMORY_TTS_CACHE[memory_cache_key] = local_url
        return local_url
    except Exception as e:
        # Fallback local file nếu persistent cache lỗi
        try:
            tts = gTTS(text=text, lang="vi", slow=False, tld='com')
            tts.save(filepath)
            local_url = f"/static/tts/{filename}"
            _IN_MEMORY_TTS_CACHE[memory_cache_key] = local_url
            return local_url
        except Exception as fallback_error:
            return None

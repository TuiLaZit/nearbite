from deep_translator import GoogleTranslator, MyMemoryTranslator
from threading import Lock
from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
import json
import os
import hashlib
import re
from datetime import datetime, timedelta, timezone
from supabase_client import supabase_client

# Map language codes để tương thích với Google Translate
LANG_MAP = {
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

# Language labels for frontend dropdown
LANGUAGE_LABELS = {
    "vi": "Tiếng Việt",
    "en": "English",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
    "it": "Italiano",
    "ru": "Русский",
    "ja": "日本語",
    "ko": "한국어",
    "zh": "中文 (简体)",
    "th": "ไทย",
    "id": "Bahasa Indonesia",
    "ms": "Bahasa Melayu"
}


_TRANSLATION_CACHE = {}
_CACHE_LOCK = Lock()
_MAX_CACHE_ITEMS = 20000
_MAX_WORKERS = int((os.getenv("TRANSLATION_MAX_WORKERS") or "4").strip() or "4")
_MAX_WORKERS = max(2, min(8, _MAX_WORKERS))
_TRANSLATION_EXECUTOR = ThreadPoolExecutor(max_workers=_MAX_WORKERS)
_BATCH_SIZE = 40
_BATCH_TIMEOUT_SECONDS = 6
_SINGLE_TIMEOUT_SECONDS = 2.5
_PREWARM_SINGLE_TIMEOUT_SECONDS = 8
_PREWARM_RETRY = 2
_PREWARM_LANG_WORKERS = 3
_CACHE_FILE = os.path.join(os.path.dirname(__file__), "translation_cache.json")
_CACHE_SAVE_EVERY = 20
_pending_cache_writes = 0
_CACHE_TTL_SECONDS = int((os.getenv("TRANSLATION_CACHE_TTL_SECONDS") or "3600").strip() or "3600")
_CACHE_TTL_SECONDS = max(60, min(86400, _CACHE_TTL_SECONDS))
_PERSISTENT_CACHE_TABLE = os.getenv("TRANSLATION_CACHE_TABLE", "translation_cache_entry").strip() or "translation_cache_entry"
_CACHE_NAMESPACE = (
    (os.getenv("CACHE_NAMESPACE") or "").strip()
    or "stable-v1"
)
_FAST_FAIL_TRANSLATION = (os.getenv("FAST_FAIL_TRANSLATION") or "false").strip().lower() in {
    "1", "true", "yes", "on"
}
_TRANSLATION_RETRY = int((os.getenv("TRANSLATION_RETRY") or "2").strip() or "2")
_TRANSLATION_RETRY = max(1, min(5, _TRANSLATION_RETRY))

SCOPED_TRANSLATION_NOTES = {
    "restaurant_narration",
    "restaurant_proximity_hint",
}
DEFAULT_TRANSLATION_NOTE = "general"


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _expires_at_iso(ttl_seconds):
    return (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()


def _normalize_source_text(text):
    """Normalize whitespace to reduce accidental duplicate cache keys."""
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _normalize_cache_note(cache_note):
    note = str(cache_note or "").strip()
    return note or DEFAULT_TRANSLATION_NOTE


def _normalize_cache_logical_key(cache_logical_key, text):
    if cache_logical_key is None:
        return _normalize_source_text(text)
    return str(cache_logical_key).strip()


def _source_checksum(text):
    normalized_text = _normalize_source_text(text)
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()


def _resolve_cache_scope_id(cache_scope_id=None, cache_note=None):
    """
    Keep per-restaurant cache only for truly restaurant-specific messages.
    Other texts use global scope to avoid duplicate rows across restaurants.
    """
    note = _normalize_cache_note(cache_note)
    if cache_scope_id is None:
        return None
    if note in SCOPED_TRANSLATION_NOTES:
        return cache_scope_id
    return None


def _persistent_cache_key(target_lang, text, cache_scope_id=None, cache_note=None, cache_logical_key=None):
    normalized_text = _normalize_source_text(text)
    normalized_note = _normalize_cache_note(cache_note)
    normalized_logical_key = _normalize_cache_logical_key(cache_logical_key, normalized_text)
    scope = str(cache_scope_id) if cache_scope_id is not None else "global"
    source = f"{_CACHE_NAMESPACE}::{scope}::{target_lang}::{normalized_note}::{normalized_logical_key}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _persistent_cache_get(target_lang, text, cache_scope_id=None, cache_note=None, cache_logical_key=None):
    if not supabase_client:
        return None

    effective_scope_id = _resolve_cache_scope_id(cache_scope_id=cache_scope_id, cache_note=cache_note)
    normalized_text = _normalize_source_text(text)
    normalized_note = _normalize_cache_note(cache_note)

    try:
        cache_key = _persistent_cache_key(
            target_lang,
            normalized_text,
            cache_scope_id=effective_scope_id,
            cache_note=normalized_note,
            cache_logical_key=cache_logical_key,
        )
        response = (
            supabase_client
            .table(_PERSISTENT_CACHE_TABLE)
            .select("translated_text,expires_at,source_checksum")
            .eq("cache_key", cache_key)
            .gt("expires_at", _utc_now_iso())
            .limit(1)
            .execute()
        )

        rows = response.data or []
        if not rows:
            # Backward compatibility: previous versions scoped all restaurant texts.
            if cache_scope_id is not None and effective_scope_id is None:
                legacy_key = _persistent_cache_key(
                    target_lang,
                    normalized_text,
                    cache_scope_id=cache_scope_id,
                    cache_note=normalized_note,
                    cache_logical_key=cache_logical_key,
                )
                legacy_response = (
                    supabase_client
                    .table(_PERSISTENT_CACHE_TABLE)
                    .select("translated_text,expires_at,source_checksum")
                    .eq("cache_key", legacy_key)
                    .gt("expires_at", _utc_now_iso())
                    .limit(1)
                    .execute()
                )
                legacy_rows = legacy_response.data or []
                if not legacy_rows:
                    return None

                legacy_value = legacy_rows[0].get("translated_text")
                if _is_valid_translated_value(target_lang, normalized_text, legacy_value):
                    # Write-through to new canonical global key for future fast hits.
                    _persistent_cache_set(
                        target_lang,
                        normalized_text,
                        legacy_value,
                        cache_scope_id=None,
                        cache_note=normalized_note,
                        cache_logical_key=cache_logical_key,
                    )
                    return legacy_value

            return None

        row = rows[0] or {}
        # If a stable logical key is used and source changed, force refresh.
        if cache_logical_key is not None:
            stored_checksum = (row.get("source_checksum") or "").strip()
            current_checksum = _source_checksum(normalized_text)
            if stored_checksum and stored_checksum != current_checksum:
                return None

        value = row.get("translated_text")
        if _is_valid_translated_value(target_lang, normalized_text, value):
            return value
    except Exception:
        return None

    return None


def _persistent_cache_set(
    target_lang,
    text,
    translated,
    cache_scope_id=None,
    cache_note=None,
    cache_logical_key=None,
    ttl_seconds=None,
):
    if not supabase_client:
        return

    ttl = _CACHE_TTL_SECONDS if ttl_seconds is None else max(60, int(ttl_seconds))
    effective_scope_id = _resolve_cache_scope_id(cache_scope_id=cache_scope_id, cache_note=cache_note)
    normalized_text = _normalize_source_text(text)
    normalized_note = _normalize_cache_note(cache_note)
    normalized_logical_key = _normalize_cache_logical_key(cache_logical_key, normalized_text)

    try:
        cache_key = _persistent_cache_key(
            target_lang,
            normalized_text,
            cache_scope_id=effective_scope_id,
            cache_note=normalized_note,
            cache_logical_key=normalized_logical_key,
        )
        payload = {
            "cache_key": cache_key,
            "restaurant_id": effective_scope_id,
            "target_lang": target_lang,
            "note": normalized_note,
            "logical_key": normalized_logical_key,
            "source_checksum": _source_checksum(normalized_text),
            "source_text": normalized_text,
            "translated_text": translated,
            "expires_at": _expires_at_iso(ttl),
            "updated_at": _utc_now_iso(),
        }

        supabase_client.table(_PERSISTENT_CACHE_TABLE).upsert(payload, on_conflict="cache_key").execute()
    except Exception:
        return


def invalidate_translation_cache(cache_scope_id=None):
    """Invalidate translation cache globally or by restaurant scope."""
    try:
        with _CACHE_LOCK:
            if cache_scope_id is None:
                _TRANSLATION_CACHE.clear()
            else:
                legacy_prefix = f"{cache_scope_id}::"
                logical_marker = f"::restaurant:{cache_scope_id}:"
                keys = [
                    key for key in _TRANSLATION_CACHE.keys()
                    if key.startswith(legacy_prefix) or logical_marker in key
                ]
                for key in keys:
                    _TRANSLATION_CACHE.pop(key, None)
    except Exception:
        pass

    if not supabase_client:
        return

    try:
        query = supabase_client.table(_PERSISTENT_CACHE_TABLE).delete()
        if cache_scope_id is None:
            query = query.gte("id", 0)
            query.execute()
        else:
            scope_id = int(cache_scope_id)
            # Clear both legacy scoped rows and catalog logical-key rows.
            supabase_client.table(_PERSISTENT_CACHE_TABLE).delete().eq("restaurant_id", scope_id).execute()
            supabase_client.table(_PERSISTENT_CACHE_TABLE).delete().like("logical_key", f"restaurant:{scope_id}:%").execute()
    except Exception:
        pass


def cleanup_expired_translation_cache(limit=1000, max_batches=5):
    if not supabase_client:
        return 0

    total_deleted = 0
    batch_limit = max(1, int(limit))
    batch_count = max(1, int(max_batches))

    try:
        for _ in range(batch_count):
            response = (
                supabase_client
                .table(_PERSISTENT_CACHE_TABLE)
                .delete()
                .lt("expires_at", _utc_now_iso())
                .limit(batch_limit)
                .execute()
            )

            deleted_rows = len((response.data or [])) if response else 0
            total_deleted += deleted_rows
            if deleted_rows < batch_limit:
                break
    except Exception:
        return total_deleted

    return total_deleted


def _is_valid_translated_value(target_lang, original_text, translated_text):
    if target_lang == "vi":
        return True
    if translated_text is None:
        return False
    value = str(translated_text).strip()
    if not value:
        return False
    return value != str(original_text).strip()


def _load_cache_from_disk():
    if not os.path.exists(_CACHE_FILE):
        return

    try:
        with open(_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        raw_entries = {}
        if isinstance(data, dict) and "entries" in data:
            if data.get("namespace") != _CACHE_NAMESPACE:
                return
            raw_entries = data.get("entries") or {}
        elif isinstance(data, dict):
            # Backward compatibility with previous flat cache format.
            raw_entries = data

        if isinstance(raw_entries, dict):
            cleaned = {}
            for cache_key, translated_value in raw_entries.items():
                parts = str(cache_key).split("::")
                if len(parts) >= 3:
                    # New format: scope::lang::logical_key
                    lang = parts[1]
                    original_text = "placeholder"
                elif len(parts) == 2:
                    # Legacy format: lang::text
                    lang, original_text = parts
                else:
                    continue

                if _is_valid_translated_value(lang, original_text, translated_value):
                    cleaned[cache_key] = translated_value

            _TRANSLATION_CACHE.update(cleaned)
    except Exception:
        # Ignore cache load errors and continue with empty in-memory cache.
        pass


def _save_cache_to_disk(force=False):
    global _pending_cache_writes

    with _CACHE_LOCK:
        if not force and _pending_cache_writes < _CACHE_SAVE_EVERY:
            return

        try:
            with open(_CACHE_FILE, "w", encoding="utf-8") as f:
                payload = {
                    "namespace": _CACHE_NAMESPACE,
                    "entries": _TRANSLATION_CACHE
                }
                json.dump(payload, f, ensure_ascii=False)
            _pending_cache_writes = 0
        except Exception:
            # Ignore disk save errors; in-memory cache still works.
            pass


_load_cache_from_disk()


def _cache_key(target_lang, text, cache_scope_id=None, cache_logical_key=None):
    text = _normalize_source_text(text)
    logical = _normalize_cache_logical_key(cache_logical_key, text)
    scope = str(cache_scope_id) if cache_scope_id is not None else "global"
    return f"{scope}::{target_lang}::{logical}"


def _cache_get(target_lang, text, cache_scope_id=None, cache_note=None, cache_logical_key=None):
    normalized_text = _normalize_source_text(text)
    effective_scope_id = _resolve_cache_scope_id(cache_scope_id=cache_scope_id, cache_note=cache_note)
    key = _cache_key(
        target_lang,
        normalized_text,
        effective_scope_id,
        cache_logical_key=cache_logical_key,
    )
    with _CACHE_LOCK:
        cached = _TRANSLATION_CACHE.get(key)
    if cached is not None:
        return cached

    # Backward compatibility with old in-memory scoped keys.
    if cache_scope_id is not None and effective_scope_id is None:
        legacy_key = _cache_key(target_lang, normalized_text, cache_scope_id)
        with _CACHE_LOCK:
            legacy_cached = _TRANSLATION_CACHE.get(legacy_key)
        if legacy_cached is not None:
            with _CACHE_LOCK:
                _TRANSLATION_CACHE[key] = legacy_cached
            return legacy_cached

    persistent = _persistent_cache_get(
        target_lang,
        normalized_text,
        cache_scope_id=cache_scope_id,
        cache_note=cache_note,
        cache_logical_key=cache_logical_key,
    )
    if persistent is not None:
        with _CACHE_LOCK:
            _TRANSLATION_CACHE[key] = persistent
        return persistent

    return None


def _cache_set(target_lang, text, translated, cache_scope_id=None, cache_note=None, cache_logical_key=None):
    normalized_text = _normalize_source_text(text)
    effective_scope_id = _resolve_cache_scope_id(cache_scope_id=cache_scope_id, cache_note=cache_note)

    if not _is_valid_translated_value(target_lang, normalized_text, translated):
        return

    global _pending_cache_writes
    key = _cache_key(
        target_lang,
        normalized_text,
        effective_scope_id,
        cache_logical_key=cache_logical_key,
    )
    with _CACHE_LOCK:
        if len(_TRANSLATION_CACHE) >= _MAX_CACHE_ITEMS:
            # Clear whole cache when full to keep implementation lightweight.
            _TRANSLATION_CACHE.clear()
        _TRANSLATION_CACHE[key] = translated
        _pending_cache_writes += 1

    _save_cache_to_disk()
    _persistent_cache_set(
        target_lang,
        normalized_text,
        translated,
        cache_scope_id=cache_scope_id,
        cache_note=cache_note,
        cache_logical_key=cache_logical_key,
    )


def _translate_single_google(text, mapped_lang):
    return GoogleTranslator(source="auto", target=mapped_lang).translate(text)


def _translate_batch_google(texts, mapped_lang):
    return GoogleTranslator(source="auto", target=mapped_lang).translate_batch(texts)


def _translate_single_mymemory(text, mapped_lang):
    return MyMemoryTranslator(source="auto", target=mapped_lang).translate(text)


def _call_with_timeout(fn, timeout_seconds):
    future = _TRANSLATION_EXECUTOR.submit(fn)
    try:
        return future.result(timeout=timeout_seconds)
    except TimeoutError:
        return None
    except Exception:
        return None


def _translate_single_with_retries(text, mapped_lang):
    translated = None

    for _ in range(_TRANSLATION_RETRY):
        translated = _call_with_timeout(
            lambda: _translate_single_google(text, mapped_lang),
            _SINGLE_TIMEOUT_SECONDS
        )
        if _is_valid_translated_value(mapped_lang, text, translated):
            return translated

    for _ in range(_TRANSLATION_RETRY):
        translated = _call_with_timeout(
            lambda: _translate_single_mymemory(text, mapped_lang),
            _SINGLE_TIMEOUT_SECONDS
        )
        if _is_valid_translated_value(mapped_lang, text, translated):
            return translated

    return None

def translate_text(
    text,
    target_lang,
    cache_scope_id=None,
    cache_note=None,
    cache_logical_key=None,
    force_refresh=False,
):
    text = _normalize_source_text(text)
    if target_lang == "vi":
        return text

    # Map language code
    mapped_lang = LANG_MAP.get(target_lang, target_lang)

    if not force_refresh:
        cached = _cache_get(
            mapped_lang,
            text,
            cache_scope_id=cache_scope_id,
            cache_note=cache_note,
            cache_logical_key=cache_logical_key,
        )
        if cached is not None:
            return cached

    translated = _translate_single_with_retries(text, mapped_lang)
    if _is_valid_translated_value(mapped_lang, text, translated):
        _cache_set(
            mapped_lang,
            text,
            translated,
            cache_scope_id=cache_scope_id,
            cache_note=cache_note,
            cache_logical_key=cache_logical_key,
        )
        return translated

    # Fallback về tiếng Việt nếu lỗi
    return text


def translate_texts(
    texts,
    target_lang,
    cache_only=False,
    fast_fail=None,
    cache_scope_id=None,
    cache_note=None,
    cache_logical_keys=None,
    force_refresh=False,
):
    if target_lang == "vi":
        return texts

    mapped_lang = LANG_MAP.get(target_lang, target_lang)
    normalized_texts = [_normalize_source_text(text) for text in texts]
    if cache_logical_keys and len(cache_logical_keys) == len(texts):
        normalized_logical_keys = [
            _normalize_cache_logical_key(cache_logical_keys[idx], normalized_texts[idx])
            for idx in range(len(texts))
        ]
    else:
        normalized_logical_keys = [None] * len(texts)

    results = [None] * len(texts)
    missing_unique = []
    missing_seen = set()

    for idx, text in enumerate(normalized_texts):
        if not force_refresh:
            cached = _cache_get(
                mapped_lang,
                text,
                cache_scope_id=cache_scope_id,
                cache_note=cache_note,
                cache_logical_key=normalized_logical_keys[idx],
            )
            if cached is not None:
                results[idx] = cached
                continue

        if text not in missing_seen:
            missing_seen.add(text)
            missing_unique.append(text)

    if cache_only:
        for idx, text in enumerate(normalized_texts):
            if results[idx] is None:
                results[idx] = text
        return results

    effective_fast_fail = _FAST_FAIL_TRANSLATION if fast_fail is None else bool(fast_fail)

    try:
        translated_lookup = {}
        if missing_unique:
            for i in range(0, len(missing_unique), _BATCH_SIZE):
                chunk = missing_unique[i:i + _BATCH_SIZE]
                translated_chunk = None
                for _ in range(_TRANSLATION_RETRY):
                    candidate = _call_with_timeout(
                        lambda chunk=chunk: _translate_batch_google(chunk, mapped_lang),
                        _BATCH_TIMEOUT_SECONDS
                    )
                    if isinstance(candidate, list) and len(candidate) == len(chunk):
                        translated_chunk = candidate
                        break

                if not isinstance(translated_chunk, list) or len(translated_chunk) != len(chunk):
                    translated_chunk = [None] * len(chunk)

                for j, original in enumerate(chunk):
                    translated_value = translated_chunk[j]
                    if not _is_valid_translated_value(mapped_lang, original, translated_value):
                        if effective_fast_fail:
                            translated_value = original
                        else:
                            translated_value = _translate_single_with_retries(original, mapped_lang) or original

                    if _is_valid_translated_value(mapped_lang, original, translated_value):
                        translated_lookup[original] = translated_value

            _save_cache_to_disk(force=True)

        for idx, text in enumerate(normalized_texts):
            if results[idx] is None:
                translated_value = translated_lookup.get(text)
                if _is_valid_translated_value(mapped_lang, text, translated_value):
                    _cache_set(
                        mapped_lang,
                        text,
                        translated_value,
                        cache_scope_id=cache_scope_id,
                        cache_note=cache_note,
                        cache_logical_key=normalized_logical_keys[idx],
                    )

                results[idx] = _cache_get(
                    mapped_lang,
                    text,
                    cache_scope_id=cache_scope_id,
                    cache_note=cache_note,
                    cache_logical_key=normalized_logical_keys[idx],
                ) or text

        return results
    except Exception:
        return [
            translate_text(
                text,
                target_lang,
                cache_scope_id=cache_scope_id,
                cache_note=cache_note,
                cache_logical_key=(normalized_logical_keys[idx] if idx < len(normalized_logical_keys) else None),
                force_refresh=force_refresh,
            )
            for idx, text in enumerate(texts)
        ]


def prewarm_translation_cache(texts, target_langs):
    unique_texts = []
    seen_texts = set()
    for text in texts or []:
        if not text or text in seen_texts:
            continue
        seen_texts.add(text)
        unique_texts.append(text)

    langs = [lang for lang in (target_langs or []) if lang and lang != "vi"]

    def _prewarm_lang(lang):
        if not lang or lang == "vi":
            return

        try:
            translate_texts(unique_texts, lang)
        except Exception:
            # Continue with fallback fill below.
            pass

        mapped_lang = LANG_MAP.get(lang, lang)

        # Ensure all texts exist in cache for this language.
        missing = [text for text in unique_texts if _cache_get(mapped_lang, text) is None]
        if not missing:
            return

        for text in missing:
            translated_value = None

            for _ in range(_PREWARM_RETRY):
                translated_value = _call_with_timeout(
                    lambda text=text: _translate_single_google(text, mapped_lang),
                    _PREWARM_SINGLE_TIMEOUT_SECONDS
                )
                if translated_value:
                    break

            # Always write something to cache to avoid repeated cold misses.
            if _is_valid_translated_value(mapped_lang, text, translated_value):
                _cache_set(mapped_lang, text, translated_value)

    if langs:
        with ThreadPoolExecutor(max_workers=min(_PREWARM_LANG_WORKERS, len(langs))) as executor:
            futures = [executor.submit(_prewarm_lang, lang) for lang in langs]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception:
                    # Keep prewarm best-effort; one language failure must not block others.
                    pass

    _save_cache_to_disk(force=True)

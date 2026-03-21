from deep_translator import GoogleTranslator
from threading import Lock
from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
import json
import os

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
_TRANSLATION_EXECUTOR = ThreadPoolExecutor(max_workers=8)
_BATCH_SIZE = 40
_BATCH_TIMEOUT_SECONDS = 6
_SINGLE_TIMEOUT_SECONDS = 2.5
_PREWARM_SINGLE_TIMEOUT_SECONDS = 8
_PREWARM_RETRY = 2
_PREWARM_LANG_WORKERS = 3
_CACHE_FILE = os.path.join(os.path.dirname(__file__), "translation_cache.json")
_CACHE_SAVE_EVERY = 20
_pending_cache_writes = 0


def _load_cache_from_disk():
    if not os.path.exists(_CACHE_FILE):
        return

    try:
        with open(_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict):
            _TRANSLATION_CACHE.update(data)
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
                json.dump(_TRANSLATION_CACHE, f, ensure_ascii=False)
            _pending_cache_writes = 0
        except Exception:
            # Ignore disk save errors; in-memory cache still works.
            pass


_load_cache_from_disk()


def _cache_key(target_lang, text):
    return f"{target_lang}::{text}"


def _cache_get(target_lang, text):
    key = _cache_key(target_lang, text)
    with _CACHE_LOCK:
        return _TRANSLATION_CACHE.get(key)


def _cache_set(target_lang, text, translated):
    global _pending_cache_writes
    key = _cache_key(target_lang, text)
    with _CACHE_LOCK:
        if len(_TRANSLATION_CACHE) >= _MAX_CACHE_ITEMS:
            # Clear whole cache when full to keep implementation lightweight.
            _TRANSLATION_CACHE.clear()
        _TRANSLATION_CACHE[key] = translated
        _pending_cache_writes += 1

    _save_cache_to_disk()


def _translate_single_google(text, mapped_lang):
    return GoogleTranslator(source="auto", target=mapped_lang).translate(text)


def _translate_batch_google(texts, mapped_lang):
    return GoogleTranslator(source="auto", target=mapped_lang).translate_batch(texts)


def _call_with_timeout(fn, timeout_seconds):
    future = _TRANSLATION_EXECUTOR.submit(fn)
    try:
        return future.result(timeout=timeout_seconds)
    except TimeoutError:
        return None
    except Exception:
        return None

def translate_text(text, target_lang):
    if target_lang == "vi":
        return text

    # Map language code
    mapped_lang = LANG_MAP.get(target_lang, target_lang)

    cached = _cache_get(mapped_lang, text)
    if cached is not None:
        return cached

    try:
        translated = _call_with_timeout(
            lambda: _translate_single_google(text, mapped_lang),
            _SINGLE_TIMEOUT_SECONDS
        )

        if translated:
            _cache_set(mapped_lang, text, translated)
            return translated
        return text
    except Exception as e:
        # Fallback về tiếng Việt nếu lỗi
        return text


def translate_texts(texts, target_lang):
    if target_lang == "vi":
        return texts

    mapped_lang = LANG_MAP.get(target_lang, target_lang)

    results = [None] * len(texts)
    missing_unique = []
    missing_seen = set()

    for idx, text in enumerate(texts):
        cached = _cache_get(mapped_lang, text)
        if cached is not None:
            results[idx] = cached
            continue

        if text not in missing_seen:
            missing_seen.add(text)
            missing_unique.append(text)

    try:
        if missing_unique:
            for i in range(0, len(missing_unique), _BATCH_SIZE):
                chunk = missing_unique[i:i + _BATCH_SIZE]
                translated_chunk = _call_with_timeout(
                    lambda chunk=chunk: _translate_batch_google(chunk, mapped_lang),
                    _BATCH_TIMEOUT_SECONDS
                )

                if not isinstance(translated_chunk, list) or len(translated_chunk) != len(chunk):
                    translated_chunk = [translate_text(text, target_lang) for text in chunk]

                for j, original in enumerate(chunk):
                    translated_value = translated_chunk[j] if translated_chunk[j] else original
                    _cache_set(mapped_lang, original, translated_value)

            _save_cache_to_disk(force=True)

        for idx, text in enumerate(texts):
            if results[idx] is None:
                results[idx] = _cache_get(mapped_lang, text) or text

        return results
    except Exception:
        return [translate_text(text, target_lang) for text in texts]


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
            _cache_set(mapped_lang, text, translated_value or text)

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

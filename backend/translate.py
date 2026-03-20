from deep_translator import GoogleTranslator
from threading import Lock

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


def _cache_key(target_lang, text):
    return f"{target_lang}::{text}"


def _cache_get(target_lang, text):
    key = _cache_key(target_lang, text)
    with _CACHE_LOCK:
        return _TRANSLATION_CACHE.get(key)


def _cache_set(target_lang, text, translated):
    key = _cache_key(target_lang, text)
    with _CACHE_LOCK:
        if len(_TRANSLATION_CACHE) >= _MAX_CACHE_ITEMS:
            # Clear whole cache when full to keep implementation lightweight.
            _TRANSLATION_CACHE.clear()
        _TRANSLATION_CACHE[key] = translated

def translate_text(text, target_lang):
    if target_lang == "vi":
        return text

    # Map language code
    mapped_lang = LANG_MAP.get(target_lang, target_lang)

    cached = _cache_get(mapped_lang, text)
    if cached is not None:
        return cached

    try:
        translated = GoogleTranslator(
            source="auto",
            target=mapped_lang
        ).translate(text)

        if translated:
            _cache_set(mapped_lang, text, translated)
        return translated
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
            translator = GoogleTranslator(source="auto", target=mapped_lang)
            translated_unique = translator.translate_batch(missing_unique)

            if not isinstance(translated_unique, list) or len(translated_unique) != len(missing_unique):
                translated_unique = [translate_text(text, target_lang) for text in missing_unique]

            for i, original in enumerate(missing_unique):
                translated_value = translated_unique[i] if translated_unique[i] else original
                _cache_set(mapped_lang, original, translated_value)

        for idx, text in enumerate(texts):
            if results[idx] is None:
                results[idx] = _cache_get(mapped_lang, text) or text

        return results
    except Exception:
        return [translate_text(text, target_lang) for text in texts]

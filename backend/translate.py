from deep_translator import GoogleTranslator

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

def translate_text(text, target_lang):
    if target_lang == "vi":
        return text

    # Map language code
    mapped_lang = LANG_MAP.get(target_lang, target_lang)

    try:
        translated = GoogleTranslator(
            source="auto",
            target=mapped_lang
        ).translate(text)

        return translated
    except Exception as e:
        print(f"Translate error for language '{target_lang}' (mapped to '{mapped_lang}'):", e)
        # Fallback về tiếng Việt nếu lỗi
        return text

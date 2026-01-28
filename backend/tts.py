import os
import uuid
import hashlib
from gtts import gTTS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.path.join(BASE_DIR, "static", "tts")
MAX_FILES = 100  # Số file audio tối đa
CLEANUP_COUNT = 50  # Số file sẽ xóa khi đạt giới hạn

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

def text_to_speech(text, lang):
    os.makedirs(TTS_DIR, exist_ok=True)

    # Map language code cho gTTS
    mapped_lang = TTS_LANG_MAP.get(lang, "vi")
    
    # Tạo filename unique dựa trên text + language để tránh cache
    hash_input = f"{text}_{mapped_lang}".encode('utf-8')
    file_hash = hashlib.md5(hash_input).hexdigest()
    filename = f"{file_hash}.mp3"
    filepath = os.path.join(TTS_DIR, filename)

    # Nếu file đã tồn tại, trả về luôn không cần tạo lại
    if os.path.exists(filepath):
        return f"/static/tts/{filename}"

    # Cleanup nếu cần
    cleanup_old_files()

    try:
        tts = gTTS(text=text, lang=mapped_lang, slow=False, tld='com')
        tts.save(filepath)
        return f"/static/tts/{filename}"
    except Exception as e:
        # Fallback: tạo TTS tiếng Việt
        try:
            tts = gTTS(text=text, lang="vi", slow=False, tld='com')
            tts.save(filepath)
            return f"/static/tts/{filename}"
        except Exception as fallback_error:
            return None

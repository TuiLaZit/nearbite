import os
import uuid
import hashlib
from gtts import gTTS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.path.join(BASE_DIR, "static", "tts")
MAX_FILES = 100  # Số file audio tối đa
CLEANUP_COUNT = 50  # Số file sẽ xóa khi đạt giới hạn

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
                    print(f"Cleaned up old audio: {files_sorted[i][0]}")
    except Exception as e:
        print(f"Cleanup error: {e}")

def text_to_speech(text, lang):
    os.makedirs(TTS_DIR, exist_ok=True)

    # Tạo filename unique dựa trên text + language để tránh cache
    hash_input = f"{text}_{lang}".encode('utf-8')
    file_hash = hashlib.md5(hash_input).hexdigest()
    filename = f"{file_hash}.mp3"
    filepath = os.path.join(TTS_DIR, filename)

    # Nếu file đã tồn tại, trả về luôn không cần tạo lại
    if os.path.exists(filepath):
        return f"/static/tts/{filename}"

    # Cleanup nếu cần
    cleanup_old_files()

    try:
        tts = gTTS(text=text, lang=lang)
        tts.save(filepath)
        return f"/static/tts/{filename}"
    except Exception as e:
        print("TTS error:", e)
        return None

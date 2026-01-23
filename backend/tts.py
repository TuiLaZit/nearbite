import os
import uuid
from gtts import gTTS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.path.join(BASE_DIR, "static", "tts")

def text_to_speech(text, lang):
    os.makedirs(TTS_DIR, exist_ok=True)

    filename = "latest.mp3"
    filepath = os.path.join(TTS_DIR, filename)

    try:
        tts = gTTS(text=text, lang=lang)
        tts.save(filepath)
        return f"/static/tts/{filename}"
    except Exception as e:
        print("TTS error:", e)
        return None

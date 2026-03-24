import os
from threading import Lock
from concurrent.futures import ThreadPoolExecutor

from models import Restaurant
from services import calculate_distance, generate_narration
from translate import LANGUAGE_LABELS, translate_texts, translate_text, invalidate_translation_cache
from tts import text_to_speech, invalidate_tts_cache

_PREWARM_RESTAURANT_WORKERS = int((os.getenv("PREWARM_RESTAURANT_WORKERS") or "2").strip() or "2")
_PREWARM_RESTAURANT_WORKERS = max(1, min(6, _PREWARM_RESTAURANT_WORKERS))

_REWARM_EXECUTOR = ThreadPoolExecutor(max_workers=_PREWARM_RESTAURANT_WORKERS)
_PENDING_RESTAURANT_IDS = set()
_PENDING_LOCK = Lock()


def resolve_target_languages(raw_langs=None):
    if raw_langs:
        requested = [str(lang or "").strip() for lang in raw_langs]
    else:
        langs_env = (os.getenv("PREWARM_LANGS") or "").strip()
        if langs_env:
            requested = [lang.strip() for lang in langs_env.split(",") if lang.strip()]
        else:
            requested = [code for code in LANGUAGE_LABELS.keys() if code != "vi"]

    filtered = []
    seen = set()
    for code in requested:
        if not code or code == "vi" or code not in LANGUAGE_LABELS or code in seen:
            continue
        seen.add(code)
        filtered.append(code)
    return filtered


def _collect_restaurant_translatable_texts(restaurant):
    payload = restaurant.to_dict(include_details=True)
    texts = []
    seen = set()

    def add_text(value):
        if not isinstance(value, str):
            return
        text = value.strip()
        if not text or text in seen:
            return
        seen.add(text)
        texts.append(text)

    add_text(payload.get("name"))
    add_text(payload.get("description"))

    for tag in payload.get("tags", []) or []:
        add_text(tag.get("name"))
        add_text(tag.get("description"))

    for item in payload.get("menu", []) or []:
        add_text(item.get("name"))

    for image in payload.get("images", []) or []:
        add_text(image.get("caption"))

    return texts


def _build_restaurant_narration_text(restaurant):
    user_lat = restaurant.lat
    user_lng = restaurant.lng
    distance_km = calculate_distance(user_lat, user_lng, restaurant.lat, restaurant.lng)
    return generate_narration(restaurant, distance_km)


def prewarm_restaurant_content(restaurant_id, target_langs=None, clear_existing=False):
    restaurant = Restaurant.query.get(restaurant_id)
    if not restaurant or not restaurant.is_active:
        return {
            "restaurant_id": restaurant_id,
            "status": "skipped",
            "reason": "restaurant-not-active"
        }

    if clear_existing:
        try:
            invalidate_translation_cache(cache_scope_id=restaurant.id)
        except Exception:
            pass
        try:
            invalidate_tts_cache(restaurant_id=restaurant.id)
        except Exception:
            pass

    langs = resolve_target_languages(target_langs)
    if not langs:
        return {
            "restaurant_id": restaurant.id,
            "status": "skipped",
            "reason": "no-target-languages"
        }

    texts = _collect_restaurant_translatable_texts(restaurant)
    narration_vi = _build_restaurant_narration_text(restaurant)
    if narration_vi:
        texts.append(narration_vi)

    for lang in langs:
        if texts:
            translate_texts(texts, lang, cache_scope_id=restaurant.id)

        translated_narration = translate_text(narration_vi, lang, cache_scope_id=restaurant.id)
        audio_url = text_to_speech(translated_narration, lang, restaurant_id=restaurant.id)

        # Keep a best-effort fallback voice to avoid missing audio button in popup.
        if not audio_url and lang != "en":
            audio_url = text_to_speech(translated_narration, "en", restaurant_id=restaurant.id)

    return {
        "restaurant_id": restaurant.id,
        "status": "ok",
        "languages": len(langs)
    }


def prewarm_all_restaurants_content(target_langs=None, clear_existing=False, only_active=True):
    query = Restaurant.query
    if only_active:
        query = query.filter_by(is_active=True)

    restaurants = query.all()
    warmed = 0
    skipped = 0

    for restaurant in restaurants:
        result = prewarm_restaurant_content(
            restaurant.id,
            target_langs=target_langs,
            clear_existing=clear_existing,
        )
        if result.get("status") == "ok":
            warmed += 1
        else:
            skipped += 1

    return {
        "restaurants_total": len(restaurants),
        "restaurants_warmed": warmed,
        "restaurants_skipped": skipped,
    }


def schedule_restaurant_rewarm(restaurant_id, reason="crud", clear_existing=False, target_langs=None, flask_app=None):
    try:
        normalized_id = int(restaurant_id)
    except Exception:
        return False

    with _PENDING_LOCK:
        if normalized_id in _PENDING_RESTAURANT_IDS:
            return False
        _PENDING_RESTAURANT_IDS.add(normalized_id)

    def _job():
        try:
            if flask_app is not None:
                with flask_app.app_context():
                    result = prewarm_restaurant_content(
                        normalized_id,
                        target_langs=target_langs,
                        clear_existing=clear_existing,
                    )
            else:
                result = prewarm_restaurant_content(
                    normalized_id,
                    target_langs=target_langs,
                    clear_existing=clear_existing,
                )
            print(f"[cache-rewarm] restaurant={normalized_id} reason={reason} result={result}")
        except Exception as exc:
            print(f"[cache-rewarm] restaurant={normalized_id} reason={reason} error={exc}")
        finally:
            with _PENDING_LOCK:
                _PENDING_RESTAURANT_IDS.discard(normalized_id)

    _REWARM_EXECUTOR.submit(_job)
    return True

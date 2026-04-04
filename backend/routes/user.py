from flask import request, jsonify, current_app, session
from models import Restaurant, Tag, LocationVisit, db
from services import calculate_distance, generate_narration
from translate import translate_text, translate_texts, LANGUAGE_LABELS
from tts import text_to_speech
from queue_manager import add_to_queue, QueueFullError
from sqlalchemy import and_, or_, text, func
from threading import Lock
import copy
import hashlib
import json
import uuid
import math
import os
from datetime import datetime, timedelta, timezone


_RESTAURANT_TRANSLATION_CACHE = {}
_RESTAURANT_CACHE_LOCK = Lock()
_RESTAURANT_CACHE_MAX_ITEMS = 5000
_DEMO_ORDER_LOCK = Lock()
_DEMO_ORDER_SEQUENCE = 0
_DEMO_ORDERS = []


def _cache_restaurant_payload(signature, payload):
    with _RESTAURANT_CACHE_LOCK:
        if len(_RESTAURANT_TRANSLATION_CACHE) >= _RESTAURANT_CACHE_MAX_ITEMS:
            _RESTAURANT_TRANSLATION_CACHE.clear()
        _RESTAURANT_TRANSLATION_CACHE[signature] = payload


def _get_restaurant_payload_from_cache(signature):
    with _RESTAURANT_CACHE_LOCK:
        cached = _RESTAURANT_TRANSLATION_CACHE.get(signature)
    return copy.deepcopy(cached) if cached is not None else None


def _build_restaurant_translation_signature(restaurant_data, target_lang):
    source = json.dumps(
        {"lang": target_lang, "restaurant": restaurant_data},
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _translate_restaurant_data(restaurant_data, target_lang, allow_network=True):
    if target_lang == "vi":
        return restaurant_data

    signature = _build_restaurant_translation_signature(restaurant_data, target_lang)
    cached = _get_restaurant_payload_from_cache(signature)
    if cached is not None:
        return cached

    translated_payload = copy.deepcopy(restaurant_data)
    text_entries = []

    def track(text, setter, logical_suffix):
        if not text or not isinstance(text, str):
            return
        text_entries.append({
            "text": text,
            "setter": setter,
            "logical_suffix": logical_suffix,
        })

    track(translated_payload.get("name"), lambda value: translated_payload.__setitem__("name", value), "name")
    track(
        translated_payload.get("description"),
        lambda value: translated_payload.__setitem__("description", value),
        "description",
    )

    for idx, tag in enumerate(translated_payload.get("tags", []) or []):
        tag_key = f"tag:{tag.get('id') if tag.get('id') is not None else idx}"
        track(tag.get("name"), lambda value, tag=tag: tag.__setitem__("name", value), f"{tag_key}:name")
        track(
            tag.get("description"),
            lambda value, tag=tag: tag.__setitem__("description", value),
            f"{tag_key}:description",
        )

    for idx, item in enumerate(translated_payload.get("menu", []) or []):
        item_key = f"menu:{item.get('id') if item.get('id') is not None else idx}"
        track(item.get("name"), lambda value, item=item: item.__setitem__("name", value), f"{item_key}:name")

    for idx, image in enumerate(translated_payload.get("images", []) or []):
        image_key = f"image:{image.get('id') if image.get('id') is not None else idx}"
        track(
            image.get("caption"),
            lambda value, image=image: image.__setitem__("caption", value),
            f"{image_key}:caption",
        )

    restaurant_id = restaurant_data.get("id")

    if text_entries:
        texts = [entry["text"] for entry in text_entries]
        logical_keys = [
            f"restaurant:{restaurant_id}:{entry['logical_suffix']}"
            for entry in text_entries
        ]
        translated_values = translate_texts(
            texts,
            target_lang,
            cache_only=not allow_network,
            cache_scope_id=restaurant_id,
            cache_note="restaurant_content",
            cache_logical_keys=logical_keys,
        )
        for idx, entry in enumerate(text_entries):
            translated_value = translated_values[idx] if idx < len(translated_values) else entry["text"]
            entry["setter"](translated_value or entry["text"])

    if allow_network:
        _cache_restaurant_payload(signature, translated_payload)
    return copy.deepcopy(translated_payload)


def register_user_routes(app):
    heatmap_cooldown_seconds = int((os.getenv("HEATMAP_SPAM_COOLDOWN_SECONDS") or "12").strip() or "12")
    heatmap_cooldown_seconds = max(3, min(300, heatmap_cooldown_seconds))

    heatmap_min_move_meters = float((os.getenv("HEATMAP_SPAM_MIN_MOVE_METERS") or "20").strip() or "20")
    heatmap_min_move_meters = max(0.0, min(1000.0, heatmap_min_move_meters))

    def _distance_meters(lat1, lng1, lat2, lng2):
        r = 6371000.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lng2 - lng1)
        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return r * c

    def _parse_coordinate(raw_value, min_value, max_value, field_name):
        if raw_value is None or str(raw_value).strip() == "":
            return None
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            raise ValueError(f"{field_name} must be a valid number")
        if value < min_value or value > max_value:
            raise ValueError(f"{field_name} is out of range")
        return value

    def _derive_session_user_identity():
        """Build stable session identity for realtime online user counting."""
        identity = None

        if session.get("admin_logged_in") and session.get("admin_email"):
            identity = f"admin:{str(session.get('admin_email')).strip().lower()}"
        elif session.get("owner_logged_in") and session.get("owner_restaurant_id") is not None:
            identity = f"owner:{int(session.get('owner_restaurant_id'))}"
        elif session.get("customer_logged_in") and session.get("customer_email"):
            identity = f"customer:{str(session.get('customer_email')).strip().lower()}"

        return identity

    def _user_profile_exists(candidate_user_id):
        if not candidate_user_id:
            return False
        try:
            found = db.session.execute(
                text("SELECT 1 FROM user_profile WHERE id = :user_id LIMIT 1"),
                {"user_id": candidate_user_id}
            ).first()
            return found is not None
        except Exception:
            # Keep heartbeat path resilient if schema differs across environments.
            return False

    @app.route("/heartbeat", methods=["POST"])
    @app.route("/api/heartbeat", methods=["POST"])
    def heartbeat():
        """
        Nhận heartbeat từ client để cập nhật trạng thái online theo device.

        Payload:
        - device_id: string (required)
        - user_id: uuid|string|null (optional, dùng khi client có session user)
        - latitude/longitude: number (optional, dùng cho heatmap heartbeat realtime)
        """
        data = request.get_json(silent=True) or {}

        device_id = (data.get("device_id") or "").strip()
        if not device_id:
            return jsonify({"status": "error", "message": "device_id is required"}), 400

        # Giới hạn độ dài để tránh dữ liệu bất thường làm phình index/text column.
        if len(device_id) > 255:
            return jsonify({"status": "error", "message": "device_id is too long (max 255 chars)"}), 400

        user_id_provided = "user_id" in data
        raw_user_id = data.get("user_id")
        user_id = None
        user_identity = None

        if raw_user_id is not None and str(raw_user_id).strip() != "":
            try:
                user_id = str(uuid.UUID(str(raw_user_id).strip()))
            except (ValueError, TypeError):
                # Keep heartbeat resilient: ignore malformed client user_id and fallback to session identity.
                user_id_provided = False
                user_id = None

        if user_id and not _user_profile_exists(user_id):
            # Avoid FK violations on user_activity.user_id when client sends unknown UUID.
            user_id = None
            user_id_provided = False

        session_identity = _derive_session_user_identity()
        if user_id_provided and user_id:
            user_identity = f"user_profile:{user_id}"
        else:
            user_identity = session_identity

        try:
            heartbeat_lat = _parse_coordinate(data.get("latitude"), -90.0, 90.0, "latitude")
            heartbeat_lng = _parse_coordinate(data.get("longitude"), -180.0, 180.0, "longitude")
        except ValueError as coord_error:
            return jsonify({"status": "error", "message": str(coord_error)}), 400

        if (heartbeat_lat is None) != (heartbeat_lng is None):
            return jsonify({"status": "error", "message": "latitude and longitude must be provided together"}), 400

        try:
            # Bước 1: update heartbeat cho device đã tồn tại.
            set_clauses = ["last_seen = NOW()"]
            update_params = {"device_id": device_id, "user_identity": user_identity}

            if user_id_provided:
                set_clauses.append("user_id = :user_id")
                update_params["user_id"] = user_id
            else:
                # Ensure logged-out devices are not counted as online users.
                set_clauses.append("user_id = NULL")

            set_clauses.append("user_identity = :user_identity")

            if heartbeat_lat is not None and heartbeat_lng is not None:
                set_clauses.extend([
                    "last_lat = :last_lat",
                    "last_lng = :last_lng",
                ])
                update_params["last_lat"] = heartbeat_lat
                update_params["last_lng"] = heartbeat_lng

            update_sql = text(
                f"""
                UPDATE user_activity
                SET {', '.join(set_clauses)}
                WHERE device_id = :device_id
                RETURNING id, device_id, user_id, last_seen
                """
            )

            updated_rows = db.session.execute(update_sql, update_params).mappings().all()

            # Bước 2: nếu chưa có device thì insert mới.
            if updated_rows:
                row = dict(updated_rows[0])
                action = "updated"

                # Historical environments may contain duplicate rows for one device_id.
                # Keep one canonical row and remove duplicates so online counters stay stable.
                if len(updated_rows) > 1:
                    keep_id = row.get("id")
                    if keep_id:
                        db.session.execute(
                            text(
                                """
                                DELETE FROM user_activity
                                WHERE device_id = :device_id
                                  AND id <> :keep_id
                                """
                            ),
                            {
                                "device_id": device_id,
                                "keep_id": keep_id,
                            }
                        )
                        action = "deduplicated_updated"
            else:
                inserted_row = db.session.execute(
                    text(
                        """
                        INSERT INTO user_activity (device_id, user_id, user_identity, last_seen, last_lat, last_lng)
                        VALUES (:device_id, :user_id, :user_identity, NOW(), :last_lat, :last_lng)
                        RETURNING id, device_id, user_id, user_identity, last_seen
                        """
                    ),
                    {
                        "device_id": device_id,
                        "user_id": user_id,
                        "user_identity": user_identity,
                        "last_lat": heartbeat_lat,
                        "last_lng": heartbeat_lng,
                    }
                ).mappings().first()

                row = dict(inserted_row or {})
                action = "inserted"

            heatmap_counted = False
            if heartbeat_lat is not None and heartbeat_lng is not None:
                try:
                    state_row = db.session.execute(
                        text(
                            """
                            SELECT last_counted_at, last_lat, last_lng
                            FROM user_activity_heatmap_device_state
                            WHERE device_id = :device_id
                            """
                        ),
                        {"device_id": device_id}
                    ).mappings().first()

                    should_count = True
                    if state_row:
                        last_counted_at = state_row.get("last_counted_at")
                        last_lat = state_row.get("last_lat")
                        last_lng = state_row.get("last_lng")

                        cooldown_passed = True
                        if last_counted_at is not None:
                            if last_counted_at.tzinfo is None:
                                last_counted_at = last_counted_at.replace(tzinfo=timezone.utc)
                            cooldown_passed = (datetime.now(timezone.utc) - last_counted_at) >= timedelta(seconds=heatmap_cooldown_seconds)

                        moved_enough = False
                        if last_lat is not None and last_lng is not None:
                            moved_enough = _distance_meters(
                                float(last_lat),
                                float(last_lng),
                                float(heartbeat_lat),
                                float(heartbeat_lng),
                            ) >= heatmap_min_move_meters

                        should_count = cooldown_passed or moved_enough

                    if should_count:
                        lat_bucket = round(float(heartbeat_lat), 4)
                        lng_bucket = round(float(heartbeat_lng), 4)

                        db.session.execute(
                            text(
                                """
                                INSERT INTO user_activity_heatmap_cell (lat_bucket, lng_bucket, hit_count, last_seen)
                                VALUES (:lat_bucket, :lng_bucket, 1, NOW())
                                ON CONFLICT (lat_bucket, lng_bucket)
                                DO UPDATE
                                SET hit_count = user_activity_heatmap_cell.hit_count + 1,
                                    last_seen = NOW()
                                """
                            ),
                            {
                                "lat_bucket": lat_bucket,
                                "lng_bucket": lng_bucket,
                            }
                        )
                        heatmap_counted = True

                    db.session.execute(
                        text(
                            """
                            INSERT INTO user_activity_heatmap_device_state (device_id, user_id, last_counted_at, last_lat, last_lng, updated_at)
                            VALUES (:device_id, :user_id, :last_counted_at, :last_lat, :last_lng, NOW())
                            ON CONFLICT (device_id)
                            DO UPDATE
                            SET user_id = EXCLUDED.user_id,
                                last_counted_at = EXCLUDED.last_counted_at,
                                last_lat = EXCLUDED.last_lat,
                                last_lng = EXCLUDED.last_lng,
                                updated_at = NOW()
                            """
                        ),
                        {
                            "device_id": device_id,
                            "user_id": user_id,
                            "last_counted_at": datetime.now(timezone.utc) if heatmap_counted else (state_row or {}).get("last_counted_at"),
                            "last_lat": heartbeat_lat if heatmap_counted else (state_row or {}).get("last_lat"),
                            "last_lng": heartbeat_lng if heatmap_counted else (state_row or {}).get("last_lng"),
                        }
                    )
                except Exception as heatmap_exc:
                    current_app.logger.warning("heartbeat heatmap write skipped: %s", heatmap_exc)

            db.session.commit()

            return jsonify({
                "status": "success",
                "action": action,
                "heartbeat": {
                    "id": row.get("id"),
                    "device_id": row.get("device_id"),
                    "user_id": str(row.get("user_id")) if row.get("user_id") else None,
                    "user_identity": row.get("user_identity") if row.get("user_identity") else user_identity,
                    "last_seen": row.get("last_seen").isoformat() if row.get("last_seen") else None,
                    "has_location": heartbeat_lat is not None and heartbeat_lng is not None,
                    "heatmap_counted": heatmap_counted,
                }
            })
        except Exception as exc:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"heartbeat failed: {exc}"}), 500

    @app.route("/languages", methods=["GET"])
    def get_languages():
        """Lấy danh sách ngôn ngữ hỗ trợ (public endpoint)"""
        languages = [{"code": code, "label": label} for code, label in LANGUAGE_LABELS.items()]
        return jsonify({
            "status": "success",
            "languages": languages
        })

    @app.route("/translate", methods=["POST"])
    def translate():
        """Dịch text sang ngôn ngữ target (public endpoint)"""
        data = request.json
        texts = data.get("texts", [])  # Array of texts to translate
        target_lang = data.get("target_lang", "vi")
        
        if not texts or not isinstance(texts, list):
            return jsonify({"status": "error", "message": "texts must be an array"}), 400
        
        # Nếu target là tiếng Việt, trả về text gốc
        if target_lang == "vi":
            return jsonify({
                "status": "success",
                "translations": {text: text for text in texts}
            })

        # Dịch theo batch để phản hồi nhanh hơn, vẫn bảo toàn placeholders.
        try:
            import re
            placeholder_pattern = re.compile(r'\{([^}]+)\}')

            protected_texts = []
            placeholder_maps = []
            original_texts = []

            translations = {}
            for text in texts:
                local_placeholder_map = {}

                def replace_placeholder(match):
                    placeholder_id = f"__PH_{len(local_placeholder_map)}__"
                    local_placeholder_map[placeholder_id] = match.group(0)
                    return placeholder_id

                protected_text = placeholder_pattern.sub(replace_placeholder, text)
                protected_texts.append(protected_text)
                placeholder_maps.append(local_placeholder_map)
                original_texts.append(text)

            translated_batch = translate_texts(protected_texts, target_lang, fast_fail=False)

            for idx, translated_text in enumerate(translated_batch):
                restored_text = translated_text or original_texts[idx]
                for placeholder_id, original_placeholder in placeholder_maps[idx].items():
                    restored_text = restored_text.replace(placeholder_id, original_placeholder)

                translations[original_texts[idx]] = restored_text

        except Exception as e:
            import traceback
            traceback.print_exc()
            translations = {text: text for text in texts}
        
        return jsonify({
            "status": "success",
            "translations": translations
        })

    @app.route("/restaurants", methods=["GET"])
    def get_restaurants():
        """Lấy danh sách tất cả quán đang active với tags và images"""
        target_lang = request.args.get('lang', 'vi')
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        restaurant_payloads = [r.to_dict(include_details=True) for r in restaurants]

        if target_lang != 'vi':
            restaurant_payloads = [
                _translate_restaurant_data(payload, target_lang)
                for payload in restaurant_payloads
            ]

        return jsonify({
            "status": "success",
            "restaurants": restaurant_payloads
        })

    @app.route("/tags", methods=["GET"])
    def get_tags():
        """Lấy danh sách tags với translation support (public endpoint)"""
        target_lang = request.args.get('lang', 'vi')
        tags = Tag.query.all()

        tags_data = [tag.to_dict() for tag in tags]

        if target_lang != 'vi':
            texts = []
            refs = {}

            for idx, tag in enumerate(tags_data):
                for field in ('name', 'description'):
                    value = tag.get(field)
                    if not value:
                        continue
                    if value not in refs:
                        refs[value] = []
                        texts.append(value)
                    refs[value].append((idx, field))

            if texts:
                translated = translate_texts(texts, target_lang)
                mapping = {
                    original: translated[i] if i < len(translated) else original
                    for i, original in enumerate(texts)
                }

                for original, positions in refs.items():
                    translated_value = mapping.get(original, original) or original
                    for idx, field in positions:
                        tags_data[idx][field] = translated_value
        
        return jsonify({
            "status": "success",
            "tags": tags_data
        })

    @app.route("/location", methods=["POST"])
    def receive_location():
        if request.method == "OPTIONS":
            return "", 200
        data = request.get_json()
        user_lat = data.get("latitude")
        user_lng = data.get("longitude")
        language = data.get("language", "vi")
        allow_network_translation = bool(data.get("allow_network_translation", False))

        restaurants = Restaurant.query.filter_by(is_active=True).all()

        nearest = None
        min_dist = float("inf")

        for r in restaurants:
            dist = calculate_distance(user_lat, user_lng, r.lat, r.lng)
            if dist < min_dist:
                min_dist = dist
                nearest = r

        narration_vi = generate_narration(nearest, min_dist)
        narration_final = translate_text(
            narration_vi,
            language,
            cache_scope_id=nearest.id,
            cache_note="restaurant_narration",
            cache_logical_key=f"restaurant:{nearest.id}:narration",
        )

        def _build_audio_url():
            primary = text_to_speech(narration_final, language, restaurant_id=nearest.id)
            if primary:
                return primary, language

            if language != "en":
                fallback_en = text_to_speech(narration_final, "en", restaurant_id=nearest.id)
                if fallback_en:
                    return fallback_en, "en"

            return None, None

        # Queue theo restaurant để hạn chế đồng thời khi nhiều người cùng nghe audio.
        try:
            audio_url, queue_meta = add_to_queue(
                nearest.id,
                _build_audio_url,
                include_meta=True,
            )
        except QueueFullError:
            return jsonify({
                "status": "error",
                "message": "Too Many Requests: queue is full for this restaurant"
            }), 429
        
        # Lấy bán kính POI từ database (mặc định 0.030 km nếu không có)
        poi_radius = nearest.poi_radius_km if hasattr(nearest, 'poi_radius_km') and nearest.poi_radius_km else 0.030
        
        # Message khi chưa đến gần quán
        out_of_range_msg_vi = f'🚶 Bạn hãy tới gần quán "{nearest.name}" để nghe thuyết minh'
        out_of_range_msg = translate_text(
            out_of_range_msg_vi,
            language,
            cache_scope_id=nearest.id,
            cache_note="restaurant_proximity_hint",
            cache_logical_key=f"restaurant:{nearest.id}:proximity_hint",
        )

        # Get restaurant data and reuse cached translation if unchanged.
        restaurant_data = nearest.to_dict(include_details=True)
        if language != 'vi':
            # /location defaults to cache-only for tracking performance.
            # Marker-click flow can opt in network translation for complete translated fields.
            restaurant_data = _translate_restaurant_data(
                restaurant_data,
                language,
                allow_network=allow_network_translation,
            )

        return jsonify({
            "status": "success",
            "language": language,
            "narration": narration_final,
            "audio_url": audio_url[0] if isinstance(audio_url, tuple) else audio_url,
            "audio_language": audio_url[1] if isinstance(audio_url, tuple) else language,
            "queue_wait_ms": queue_meta.get("queue_wait_ms", 0),
            "queue_position": queue_meta.get("queue_position", 1),
            "distance_km": round(min_dist, 3),
            "poi_radius_km": poi_radius,
            "nearest_place": restaurant_data,
            "out_of_range_message": out_of_range_msg
        })

    @app.route("/orders", methods=["POST"])
    def create_order():
        """
        Ví dụ route tạo order có queue theo restaurant.

        Lưu ý: Dự án hiện chưa có model order chính thức, nên route này lưu demo
        vào bộ nhớ để minh họa cách tích hợp add_to_queue trong Flask.
        """
        data = request.get_json(silent=True) or {}

        restaurant_id = data.get("restaurant_id")
        customer_name = (data.get("customer_name") or "Guest").strip() or "Guest"
        items = data.get("items")

        if restaurant_id is None:
            return jsonify({"status": "error", "message": "restaurant_id is required"}), 400

        if not isinstance(items, list) or len(items) == 0:
            return jsonify({"status": "error", "message": "items must be a non-empty array"}), 400

        app_obj = current_app._get_current_object()

        def _create_order_job():
            with app_obj.app_context():
                restaurant = Restaurant.query.get(restaurant_id)
                if not restaurant or not restaurant.is_active:
                    raise LookupError("Restaurant not found")

                global _DEMO_ORDER_SEQUENCE
                with _DEMO_ORDER_LOCK:
                    _DEMO_ORDER_SEQUENCE += 1
                    order_record = {
                        "order_id": _DEMO_ORDER_SEQUENCE,
                        "restaurant_id": restaurant_id,
                        "customer_name": customer_name,
                        "items": items,
                        "status": "created",
                        "created_at": datetime.utcnow().isoformat() + "Z",
                    }
                    _DEMO_ORDERS.append(order_record)
                return order_record

        try:
            order_result, queue_meta = add_to_queue(
                restaurant_id,
                _create_order_job,
                include_meta=True,
            )
            return jsonify({
                "status": "success",
                "data": order_result,
                "queue_wait_ms": queue_meta.get("queue_wait_ms", 0),
                "queue_position": queue_meta.get("queue_position", 1),
            }), 201
        except QueueFullError:
            return jsonify({
                "status": "error",
                "message": "Too Many Requests: queue is full for this restaurant"
            }), 429
        except LookupError:
            return jsonify({"status": "error", "message": "Restaurant not found"}), 404
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route("/plan-tour", methods=["POST"])
    def plan_tour():
        """
        Xếp tour ăn uống dựa trên:
        - time_limit: Tổng thời gian ăn (phút)
        - budget: Tổng tiền có (VND)
        - tags: Danh sách tag IDs muốn ăn
        - user_lat, user_lng: Vị trí hiện tại
        
        Trả về 3 tour hợp lý
        """
        try:
            data = request.get_json()
            time_limit = data.get("time_limit", 120)  # Default 2 giờ
            budget = data.get("budget", 500000)  # Default 500k
            selected_tag_ids = data.get("tags", [])  # List of tag IDs
            user_lat = data.get("user_lat")
            user_lng = data.get("user_lng")
            
            # Bước 1: Lấy toàn bộ quán active (không loại cứng theo tag).
            # Tag preference sẽ được xử lý bằng heuristic scoring ở bước sau.
            restaurants = Restaurant.query.filter_by(is_active=True).all()
            
            if not restaurants:
                return jsonify({
                    "status": "error",
                    "message": "Không tìm thấy quán phù hợp với tiêu chí"
                })
            
            # Bước 2: Tính giá trung bình menu theo từng quán (aggregate 1 lần)
            from models import MenuItem

            restaurant_ids = [r.id for r in restaurants]
            avg_price_rows = (
                db.session.query(
                    MenuItem.restaurant_id,
                    func.avg(MenuItem.price).label("avg_price"),
                )
                .filter(MenuItem.restaurant_id.in_(restaurant_ids))
                .group_by(MenuItem.restaurant_id)
                .all()
            )

            avg_price_by_restaurant = {
                int(row.restaurant_id): float(row.avg_price)
                for row in avg_price_rows
                if row.restaurant_id is not None and row.avg_price is not None
            }

            # Fallback mềm khi quán chưa có menu: dùng mặt bằng trung bình hiện có.
            global_avg_price = (
                sum(avg_price_by_restaurant.values()) / len(avg_price_by_restaurant)
                if avg_price_by_restaurant
                else 50000
            )

            # Bước 3: Gán điểm cho từng quán (Scoring)
            scored_restaurants = []
            for restaurant in restaurants:
                score = 0
                
                # Match preference: số lượng tags khớp (boost mạnh nhưng không loại quán không khớp)
                matching_tags = len([tag for tag in restaurant.tags if tag.id in selected_tag_ids])
                score += matching_tags * 25
                
                # Price fit: dùng giá trung bình của toàn bộ menu quán.
                avg_price = avg_price_by_restaurant.get(restaurant.id, global_avg_price)
                
                if avg_price < budget / 3:
                    score += 5
                elif avg_price < budget / 2:
                    score += 3
                
                # Time fit: ưu tiên quán gần (tính khoảng cách nếu có vị trí user)
                distance_from_user = None
                if user_lat and user_lng:
                    distance_from_user = calculate_distance(user_lat, user_lng, restaurant.lat, restaurant.lng)
                    if distance_from_user < 0.5:  # < 500m
                        score += 8
                    elif distance_from_user < 1:  # < 1km
                        score += 5
                    elif distance_from_user < 2:  # < 2km
                        score += 2
                
                scored_restaurants.append({
                    "restaurant": restaurant,
                    "score": score,
                    "avg_price": avg_price,
                    "matching_tags": matching_tags,
                    "distance_from_user": distance_from_user  # Lưu khoảng cách để dùng sau
                })
            
            # Bước 4: Sắp xếp theo điểm (Sort)
            scored_restaurants.sort(key=lambda x: x["score"], reverse=True)
            
            # Bước 5: Build 3 tours khác nhau (Greedy)
            tours = []

            def _tour_restaurant_ids(tour_data):
                if not tour_data:
                    return set()
                return {
                    int(restaurant.get("id"))
                    for restaurant in (tour_data.get("restaurants") or [])
                    if restaurant.get("id") is not None
                }

            def _is_distinct_tour(candidate_tour, existing_tours):
                # Khác biệt tối thiểu: phải khác ít nhất 1 quán (không trùng nguyên set id).
                candidate_ids = _tour_restaurant_ids(candidate_tour)
                if not candidate_ids:
                    return False
                for existing in existing_tours:
                    if candidate_ids == _tour_restaurant_ids(existing):
                        return False
                return True

            def _build_distinct_tour(strategy_name, existing_tours):
                candidate = build_greedy_tour(
                    scored_restaurants,
                    time_limit,
                    budget,
                    strategy=strategy_name,
                )
                if candidate and _is_distinct_tour(candidate, existing_tours):
                    return candidate

                # Nếu trùng nguyên set, thử loại trừ từng quán từ các tour trước để ép khác tối thiểu 1 quán.
                excluded_pool = []
                for existing in existing_tours:
                    for rid in _tour_restaurant_ids(existing):
                        if rid not in excluded_pool:
                            excluded_pool.append(rid)

                for excluded_id in excluded_pool:
                    retried = build_greedy_tour(
                        scored_restaurants,
                        time_limit,
                        budget,
                        strategy=strategy_name,
                        excluded_restaurant_ids={excluded_id},
                    )
                    if retried and _is_distinct_tour(retried, existing_tours):
                        return retried

                # Không thể ép khác thêm do ràng buộc dữ liệu/time/budget.
                return None
            
            # Tour 1: Ưu tiên điểm cao nhất
            tour1 = _build_distinct_tour("best_score", tours)
            if tour1:
                tours.append(tour1)
            
            # Tour 2: Ưu tiên quán gần nhất (nếu có vị trí)
            if user_lat and user_lng:
                tour2 = _build_distinct_tour("nearest", tours)
                if tour2 and _is_distinct_tour(tour2, tours):
                    tours.append(tour2)
            
            # Tour 3: Ưu tiên giá rẻ nhất
            tour3 = _build_distinct_tour("cheapest", tours)
            if tour3 and _is_distinct_tour(tour3, tours):
                tours.append(tour3)
            
            # Không lặp lại tour - trả về đúng số tour có thể tạo
            # Mỗi tour có chiến lược riêng, không duplicate
            
            return jsonify({
                "status": "success",
                "tours": tours,
                "total_restaurants": len(restaurants)
            })
            
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": str(e)
            }), 500

    # ======================
    # LOCATION TRACKING
    # ======================

    @app.route("/track-location", methods=["POST"])
    def track_location():
        """Track user location visits for heatmap"""
        try:
            data = request.json
            
            lat = data.get("lat")
            lng = data.get("lng")
            duration_seconds = data.get("duration_seconds")
            
            if not all([lat, lng, duration_seconds]):
                return jsonify({"error": "Missing required fields"}), 400
            
            # Find if near any restaurant
            restaurant_id = None
            restaurants = Restaurant.query.filter_by(is_active=True).all()
            
            for r in restaurants:
                distance = calculate_distance(lat, lng, r.lat, r.lng)
                if distance <= r.poi_radius_km:
                    restaurant_id = r.id
                    # Update restaurant analytics khi duration >= 10s
                    if duration_seconds >= 10:
                        # Tính trung bình đúng cho avg_visit_duration (giây)
                        # Công thức: New_Avg = (Old_Avg * Old_Count + New_Value) / (Old_Count + 1)
                        if r.visit_count == 0 or r.avg_visit_duration == 0:
                            r.avg_visit_duration = duration_seconds
                        else:
                            r.avg_visit_duration = int(
                                (r.avg_visit_duration * r.visit_count + duration_seconds) / (r.visit_count + 1)
                            )
                        
                        # Tăng visit_count SAU KHI tính average
                        r.visit_count += 1
                        
                        # Commit ngay để lưu analytics
                        db.session.commit()
                    break
            
            # Save location visit
            visit = LocationVisit(
                lat=lat,
                lng=lng,
                duration_seconds=duration_seconds,
                restaurant_id=restaurant_id
            )
            db.session.add(visit)
            db.session.commit()
            
            return jsonify({"status": "success"})
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

    @app.route("/track-audio", methods=["POST"])
    def track_audio():
        """Track audio playback duration"""
        try:
            data = request.json
            
            restaurant_id = data.get("restaurant_id")
            duration_seconds = data.get("duration_seconds")
            
            if not all([restaurant_id, duration_seconds]):
                return jsonify({"error": "Missing required fields"}), 400

            app_obj = current_app._get_current_object()

            def _track_audio_job():
                with app_obj.app_context():
                    try:
                        restaurant = Restaurant.query.get(restaurant_id)
                        if not restaurant:
                            raise LookupError("Restaurant not found")

                        # Tính trung bình đúng cho avg_audio_duration (giây)
                        # Công thức: New_Avg = (Old_Avg * Old_Count + New_Value) / (Old_Count + 1)
                        if restaurant.audio_play_count == 0 or restaurant.avg_audio_duration == 0:
                            restaurant.avg_audio_duration = duration_seconds
                        else:
                            restaurant.avg_audio_duration = int(
                                (restaurant.avg_audio_duration * restaurant.audio_play_count + duration_seconds) / (restaurant.audio_play_count + 1)
                            )

                        # Tăng audio play count SAU KHI tính average
                        restaurant.audio_play_count += 1
                        db.session.commit()
                        return {"status": "success"}
                    except Exception:
                        db.session.rollback()
                        raise

            result, queue_meta = add_to_queue(
                restaurant_id,
                _track_audio_job,
                include_meta=True,
            )
            result["queue_wait_ms"] = queue_meta.get("queue_wait_ms", 0)
            result["queue_position"] = queue_meta.get("queue_position", 1)
            return jsonify(result)
        except QueueFullError:
            return jsonify({
                "status": "error",
                "message": "Too Many Requests: queue is full for this restaurant"
            }), 429
        except LookupError:
            return jsonify({"error": "Restaurant not found"}), 404
            
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

def build_greedy_tour(scored_restaurants, time_limit, budget, strategy="best_score", excluded_restaurant_ids=None):
    """
    Xây dựng tour bằng thuật toán greedy
    
    Args:
        scored_restaurants: List of {restaurant, score, avg_price, matching_tags}
        time_limit: Thời gian tối đa (phút)
        budget: Ngân sách tối đa (VND)
        strategy: Chiến lược ("best_score", "nearest", "cheapest")
    
    Returns:
        Dict chứa tour info hoặc None nếu không tạo được tour
    """
    tour = []
    total_time = 0
    total_cost = 0
    default_eat_time = 30  # fallback khi quán chưa có avg_eat_time
    excluded_restaurant_ids = set(excluded_restaurant_ids or [])
    remaining_candidates = list(scored_restaurants)

    def _distance_bucket(distance_km):
        # Nhóm: <500m, [500m-1km), [1km-3km), còn lại.
        if not math.isfinite(distance_km):
            return 3
        if distance_km < 0.5:
            return 0
        if distance_km < 1.0:
            return 1
        if distance_km < 3.0:
            return 2
        return 3

    def _price_bucket(avg_price_value):
        # Bucket theo % budget: <=15%, <=20%, <=25%, <=30%, ... (step 5%).
        safe_budget = float(budget) if float(budget) > 0 else 1.0
        price_ratio_percent = (float(avg_price_value) / safe_budget) * 100.0
        if price_ratio_percent <= 15.0:
            return 0
        return int(math.ceil((price_ratio_percent - 15.0) / 5.0))

    def _bucket_bonus(bucket):
        # Bucket thấp hơn => phù hợp hơn.
        return max(0.0, 24.0 - (float(bucket) * 6.0))

    def _candidate_priority(item, last_restaurant):
        """
        Chấm điểm heuristic có bias theo strategy.
        - Mỗi strategy chỉ bias mạnh hơn 1 tiêu chí (distance hoặc price).
        - Vẫn giữ score/tags làm nền để tránh chọn "cứng" theo 1 cột.
        """
        restaurant = item["restaurant"]
        score = float(item.get("score") or 0.0)
        avg_price = float(item.get("avg_price") or 0.0)
        matching_tags = int(item.get("matching_tags") or 0)

        distance_from_user = item.get("distance_from_user")
        user_distance_km = float(distance_from_user) if distance_from_user is not None else float("inf")
        user_distance_bucket = _distance_bucket(user_distance_km)
        user_distance_bonus = _bucket_bonus(user_distance_bucket)

        if last_restaurant is not None:
            leg_distance_km = calculate_distance(
                last_restaurant.lat,
                last_restaurant.lng,
                restaurant.lat,
                restaurant.lng,
            )
        else:
            leg_distance_km = user_distance_km

        leg_distance_bucket = _distance_bucket(leg_distance_km)
        leg_distance_bonus = _bucket_bonus(leg_distance_bucket)

        price_bucket = _price_bucket(avg_price)
        price_bonus = _bucket_bonus(price_bucket)

        if strategy == "nearest":
            utility = (
                score * 1.15
                + matching_tags * 2.5
                + leg_distance_bonus * 2.8
                + user_distance_bonus * 1.2
                + price_bonus * 0.5
            )
            return (
                utility,
                -float(leg_distance_km if math.isfinite(leg_distance_km) else 10**9),
                -avg_price,
                matching_tags,
                score,
            )

        if strategy == "cheapest":
            utility = (
                score * 1.15
                + matching_tags * 2.5
                + price_bonus * 2.8
                + user_distance_bonus * 0.9
                + leg_distance_bonus * 0.4
            )
            return (
                utility,
                -avg_price,
                -float(user_distance_km if math.isfinite(user_distance_km) else 10**9),
                matching_tags,
                score,
            )

        # best_score: score là chính, distance/price chỉ hỗ trợ nhẹ.
        utility = (
            score * 1.7
            + matching_tags * 2.0
            + user_distance_bonus * 0.6
            + price_bonus * 0.6
        )
        return (
            utility,
            matching_tags,
            -avg_price,
            -float(user_distance_km if math.isfinite(user_distance_km) else 10**9),
        )

    last_selected_restaurant = None

    while remaining_candidates:
        feasible_candidates = []
        for item in remaining_candidates:
            restaurant = item["restaurant"]
            if restaurant.id in excluded_restaurant_ids:
                continue
            avg_price = float(item["avg_price"])
            eat_time = restaurant.avg_eat_time or default_eat_time

            if total_time + eat_time <= time_limit and total_cost + avg_price <= budget:
                feasible_candidates.append(item)

        if not feasible_candidates:
            break

        chosen_item = max(feasible_candidates, key=lambda candidate: _candidate_priority(candidate, last_selected_restaurant))
        remaining_candidates.remove(chosen_item)

        restaurant = chosen_item["restaurant"]
        avg_price = float(chosen_item["avg_price"])
        eat_time = restaurant.avg_eat_time or default_eat_time

        tour.append({
            "id": restaurant.id,
            "name": restaurant.name,
            "description": restaurant.description,
            "lat": restaurant.lat,
            "lng": restaurant.lng,
            "avg_eat_time": eat_time,
            "avg_price": round(avg_price),
            "score": chosen_item["score"],
            "matching_tags": chosen_item["matching_tags"],
            "tags": [{"id": tag.id, "name": tag.name, "icon": tag.icon, "color": tag.color} for tag in restaurant.tags],
            "images": [{"image_url": img.image_url, "is_primary": img.is_primary} for img in restaurant.images[:2]]  # Chỉ lấy 2 ảnh đầu
        })
        total_time += eat_time
        total_cost += avg_price
        last_selected_restaurant = restaurant

        # Giới hạn tour tối đa 5 quán
        if len(tour) >= 5:
            break
    
    if not tour:
        return None
    
    return {
        "strategy": strategy,
        "restaurants": tour,
        "total_time": total_time,
        "total_cost": round(total_cost),
        "num_stops": len(tour)
    }

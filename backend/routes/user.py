from flask import request, jsonify
from models import Restaurant, Tag, LocationVisit, db
from services import calculate_distance, generate_narration
from translate import translate_text, translate_texts, LANGUAGE_LABELS
from tts import text_to_speech
from sqlalchemy import and_, or_
from threading import Lock
import copy
import hashlib
import json


_RESTAURANT_TRANSLATION_CACHE = {}
_RESTAURANT_CACHE_LOCK = Lock()
_RESTAURANT_CACHE_MAX_ITEMS = 5000


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
    text_refs = {}
    texts = []

    def track(text, setter):
        if not text or not isinstance(text, str):
            return
        if text not in text_refs:
            text_refs[text] = []
            texts.append(text)
        text_refs[text].append(setter)

    track(translated_payload.get("name"), lambda value: translated_payload.__setitem__("name", value))
    track(translated_payload.get("description"), lambda value: translated_payload.__setitem__("description", value))

    for tag in translated_payload.get("tags", []) or []:
        track(tag.get("name"), lambda value, tag=tag: tag.__setitem__("name", value))
        track(tag.get("description"), lambda value, tag=tag: tag.__setitem__("description", value))

    for item in translated_payload.get("menu", []) or []:
        track(item.get("name"), lambda value, item=item: item.__setitem__("name", value))

    for image in translated_payload.get("images", []) or []:
        track(image.get("caption"), lambda value, image=image: image.__setitem__("caption", value))

    restaurant_id = restaurant_data.get("id")

    if texts:
        translated_texts = translate_texts(
            texts,
            target_lang,
            cache_only=not allow_network,
            cache_scope_id=restaurant_id,
        )
        translation_map = {}
        for idx, original in enumerate(texts):
            translation_map[original] = translated_texts[idx] if idx < len(translated_texts) else original

        for original, setters in text_refs.items():
            translated_value = translation_map.get(original, original) or original
            for setter in setters:
                setter(translated_value)

    if allow_network:
        _cache_restaurant_payload(signature, translated_payload)
    return copy.deepcopy(translated_payload)


def register_user_routes(app):
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
        narration_final = translate_text(narration_vi, language, cache_scope_id=nearest.id)
        audio_url = text_to_speech(narration_final, language, restaurant_id=nearest.id)
        
        # Lấy bán kính POI từ database (mặc định 0.030 km nếu không có)
        poi_radius = nearest.poi_radius_km if hasattr(nearest, 'poi_radius_km') and nearest.poi_radius_km else 0.030
        
        # Message khi chưa đến gần quán
        out_of_range_msg_vi = f'🚶 Bạn hãy tới gần quán "{nearest.name}" để nghe thuyết minh'
        out_of_range_msg = translate_text(out_of_range_msg_vi, language, cache_scope_id=nearest.id)

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
            "audio_url": audio_url,
            "distance_km": round(min_dist, 3),
            "poi_radius_km": poi_radius,
            "nearest_place": restaurant_data,
            "out_of_range_message": out_of_range_msg
        })

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
            
            # Bước 1: Lọc quán (Filter)
            query = Restaurant.query.filter_by(is_active=True)
            
            if selected_tag_ids:
                # Lọc quán có ít nhất 1 tag trong danh sách
                query = query.filter(
                    Restaurant.tags.any(Tag.id.in_(selected_tag_ids))
                )
            
            restaurants = query.all()
            
            if not restaurants:
                return jsonify({
                    "status": "error",
                    "message": "Không tìm thấy quán phù hợp với tiêu chí"
                })
            
            # Bước 2: Gán điểm cho từng quán (Scoring)
            scored_restaurants = []
            for restaurant in restaurants:
                score = 0
                
                # Match preference: số lượng tags khớp
                matching_tags = len([tag for tag in restaurant.tags if tag.id in selected_tag_ids])
                score += matching_tags * 10
                
                # Price fit: ưu tiên quán rẻ hơn (tính avg price từ menu)
                from models import MenuItem
                menu_items = MenuItem.query.filter_by(restaurant_id=restaurant.id).all()
                if menu_items:
                    avg_price = sum(item.price for item in menu_items) / len(menu_items)
                else:
                    avg_price = 50000  # Default nếu không có menu
                
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
            
            # Bước 3: Sắp xếp theo điểm (Sort)
            scored_restaurants.sort(key=lambda x: x["score"], reverse=True)
            
            # Bước 4: Build 3 tours khác nhau (Greedy)
            tours = []
            
            # Tour 1: Ưu tiên điểm cao nhất
            tour1 = build_greedy_tour(
                scored_restaurants, 
                time_limit, 
                budget,
                strategy="best_score"
            )
            if tour1:
                tours.append(tour1)
            
            # Tour 2: Ưu tiên quán gần nhất (nếu có vị trí)
            if user_lat and user_lng:
                # Sắp xếp lại theo khoảng cách, ưu tiên quán gần user
                sorted_by_distance = sorted(
                    scored_restaurants,
                    key=lambda x: x["distance_from_user"] if x["distance_from_user"] is not None else float('inf')
                )
                tour2 = build_greedy_tour(
                    sorted_by_distance,
                    time_limit,
                    budget,
                    strategy="nearest"
                )
                if tour2 and tour2 != tour1:
                    tours.append(tour2)
            
            # Tour 3: Ưu tiên giá rẻ nhất
            sorted_by_price = sorted(
                scored_restaurants,
                key=lambda x: x["avg_price"]
            )
            tour3 = build_greedy_tour(
                sorted_by_price,
                time_limit,
                budget,
                strategy="cheapest"
            )
            if tour3 and tour3 not in tours:
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
            
            restaurant = Restaurant.query.get(restaurant_id)
            if restaurant:
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
            else:
                return jsonify({"error": "Restaurant not found"}), 404
            
            return jsonify({"status": "success"})
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

def build_greedy_tour(scored_restaurants, time_limit, budget, strategy="best_score"):
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
    avg_eat_time = 30  # Giả sử mỗi quán ăn 30 phút
    
    for item in scored_restaurants:
        restaurant = item["restaurant"]
        avg_price = item["avg_price"]
        
        # Kiểm tra constraints
        if total_time + avg_eat_time <= time_limit and total_cost + avg_price <= budget:
            tour.append({
                "id": restaurant.id,
                "name": restaurant.name,
                "lat": restaurant.lat,
                "lng": restaurant.lng,
                "avg_price": round(avg_price),
                "score": item["score"],
                "matching_tags": item["matching_tags"],
                "tags": [{"id": tag.id, "name": tag.name, "icon": tag.icon, "color": tag.color} for tag in restaurant.tags],
                "images": [{"image_url": img.image_url, "is_primary": img.is_primary} for img in restaurant.images[:2]]  # Chỉ lấy 2 ảnh đầu
            })
            total_time += avg_eat_time
            total_cost += avg_price
            
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

from flask import request, jsonify, session
from models import Restaurant, Tag, LocationVisit, MenuItem, Order, OrderItem, db
from services import calculate_distance, generate_narration
from translate import translate_text, LANGUAGE_LABELS
from tts import text_to_speech
from sqlalchemy import and_, or_
from datetime import datetime
import os
import secrets


def register_user_routes(app):

    def customer_required():
        if not session.get("customer_logged_in") or not session.get("customer_email"):
            return None, (jsonify({"error": "Unauthorized"}), 401)
        return session.get("customer_email"), None

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
        
        # Batch dịch - gộp tất cả texts vào một string, dịch 1 lần
        try:
            # Bảo vệ placeholders {variable} trước khi dịch
            import re
            import uuid
            placeholder_pattern = re.compile(r'\{([^}]+)\}')
            
            # Lưu mapping placeholders
            placeholder_map = {}
            protected_texts = []
            
            for text in texts:
                # Thay thế {placeholder} bằng __PHXX__ (XX là index)
                def replace_placeholder(match):
                    placeholder_id = f"__PH{len(placeholder_map)}__"
                    placeholder_map[placeholder_id] = match.group(0)  # Lưu {count}, {variable}...
                    return placeholder_id
                
                protected_text = placeholder_pattern.sub(replace_placeholder, text)
                protected_texts.append(protected_text)
            
            # Dùng separator với UUID để tránh bị dịch
            separator_id = str(uuid.uuid4())[:8]
            separator = f"\n<<<{separator_id}>>>\n"
            combined_text = separator.join(protected_texts)
            
            # Dịch 1 lần duy nhất
            translated_combined = translate_text(combined_text, target_lang)
            
            # Tách lại thành array - thử nhiều cách
            translated_parts = translated_combined.split(separator)
            
            # Nếu separator bị thay đổi, thử fallback
            if len(translated_parts) != len(texts):
                # Thử split bằng các biến thể khác
                for alt_sep in [f"\n<<< {separator_id} >>>\n", f"<<< {separator_id} >>>", separator_id]:
                    translated_parts = translated_combined.split(alt_sep)
                    if len(translated_parts) == len(texts):
                        break
            
            # Khôi phục placeholders và map lại với original texts
            translations = {}
            for i, text in enumerate(texts):
                if i < len(translated_parts):
                    translated_text = translated_parts[i].strip()
                    # Khôi phục các placeholders
                    for placeholder_id, original_placeholder in placeholder_map.items():
                        translated_text = translated_text.replace(placeholder_id, original_placeholder)
                    translations[text] = translated_text
                else:
                    translations[text] = text  # Fallback
                    
        except Exception as e:
            import traceback
            traceback.print_exc()
            # Fallback: trả về text gốc
            translations = {text: text for text in texts}
        
        return jsonify({
            "status": "success",
            "translations": translations
        })

    @app.route("/restaurants", methods=["GET"])
    def get_restaurants():
        """Lấy danh sách tất cả quán đang active với tags và images"""
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        return jsonify({
            "status": "success",
            "restaurants": [r.to_dict(include_details=True) for r in restaurants]
        })

    @app.route("/tags", methods=["GET"])
    def get_tags():
        """Lấy danh sách tags với translation support (public endpoint)"""
        target_lang = request.args.get('lang', 'vi')
        tags = Tag.query.all()
        
        tags_data = []
        for tag in tags:
            tag_dict = tag.to_dict()
            
            # Dịch tag name nếu không phải tiếng Việt
            if target_lang != 'vi' and tag.name:
                try:
                    tag_dict['name'] = translate_text(tag.name, target_lang)
                except Exception as e:
                    # Giữ nguyên tiếng Việt nếu lỗi
                    pass
            
            tags_data.append(tag_dict)
        
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

        restaurants = Restaurant.query.filter_by(is_active=True).all()

        nearest = None
        min_dist = float("inf")

        for r in restaurants:
            dist = calculate_distance(user_lat, user_lng, r.lat, r.lng)
            if dist < min_dist:
                min_dist = dist
                nearest = r

        narration_vi = generate_narration(nearest, min_dist)
        narration_final = translate_text(narration_vi, language)
        audio_url = text_to_speech(narration_final, language)
        
        # Lấy bán kính POI từ database (mặc định 0.030 km nếu không có)
        poi_radius = nearest.poi_radius_km if hasattr(nearest, 'poi_radius_km') and nearest.poi_radius_km else 0.030
        
        # Message khi chưa đến gần quán
        out_of_range_msg_vi = f'🚶 Bạn hãy tới gần quán "{nearest.name}" để nghe thuyết minh'
        out_of_range_msg = translate_text(out_of_range_msg_vi, language)

        # Get restaurant data with translated tags
        restaurant_data = nearest.to_dict(include_details=True)
        
        # Translate tag names if not Vietnamese
        if language != 'vi' and 'tags' in restaurant_data:
            for tag in restaurant_data['tags']:
                if tag.get('name'):
                    try:
                        tag['name'] = translate_text(tag['name'], language)
                    except Exception as e:
                        # Keep original Vietnamese if translation fails
                        pass

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

    # ======================
    # CUSTOMER ORDERS
    # ======================

    @app.route("/customer/orders", methods=["POST"])
    def create_customer_order():
        customer_email, error_response = customer_required()
        if error_response:
            return error_response

        data = request.get_json() or {}
        restaurant_id = data.get("restaurant_id")
        order_type = (data.get("order_type") or "").strip().lower()
        delivery_address = (data.get("delivery_address") or "").strip()
        payment_method = (data.get("payment_method") or "").strip().lower()
        order_items = data.get("items") or []
        note = (data.get("note") or "").strip()

        if order_type not in ["delivery", "pickup"]:
            return jsonify({"error": "Loại đơn không hợp lệ"}), 400

        if order_type == "delivery" and not delivery_address:
            return jsonify({"error": "Vui lòng nhập địa chỉ giao hàng"}), 400

        if order_type == "delivery" and payment_method != "online_demo":
            return jsonify({"error": "Đơn giao hàng chỉ hỗ trợ thanh toán online"}), 400

        if order_type == "pickup" and payment_method not in ["online_demo", "cod"]:
            return jsonify({"error": "Đơn đặt trước chỉ hỗ trợ COD hoặc online"}), 400

        if not isinstance(order_items, list) or len(order_items) == 0:
            return jsonify({"error": "Vui lòng chọn ít nhất 1 món"}), 400

        restaurant = Restaurant.query.filter_by(id=restaurant_id, is_active=True).first()
        if not restaurant:
            return jsonify({"error": "Không tìm thấy quán"}), 404

        subtotal_amount = 0
        normalized_items = []

        for raw_item in order_items:
            menu_item_id = raw_item.get("menu_item_id")
            quantity = int(raw_item.get("quantity", 0))

            if quantity <= 0:
                return jsonify({"error": "Số lượng món phải lớn hơn 0"}), 400

            menu_item = MenuItem.query.filter_by(id=menu_item_id, restaurant_id=restaurant.id).first()
            if not menu_item:
                return jsonify({"error": "Món ăn không hợp lệ"}), 400

            line_total = menu_item.price * quantity
            subtotal_amount += line_total
            normalized_items.append({
                "menu_item_id": menu_item.id,
                "item_name": menu_item.name,
                "unit_price": menu_item.price,
                "quantity": quantity,
                "line_total": line_total
            })

        commission_rate = float(os.getenv("ORDER_COMMISSION_RATE", "0.1"))
        commission_rate = max(0.0, min(commission_rate, 1.0))
        commission_amount = int(round(subtotal_amount * commission_rate))
        total_amount = subtotal_amount + commission_amount

        if payment_method == "online_demo":
            payment_status = "paid_demo"
            payment_transaction_id = f"DEMO-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{secrets.randbelow(10000):04d}"
        else:
            payment_status = "pending_cod"
            payment_transaction_id = None

        order = Order(
            restaurant_id=restaurant.id,
            customer_email=customer_email,
            order_type=order_type,
            delivery_address=delivery_address if order_type == "delivery" else None,
            payment_method=payment_method,
            payment_status=payment_status,
            payment_transaction_id=payment_transaction_id,
            order_status="pending",
            subtotal_amount=subtotal_amount,
            commission_rate=commission_rate,
            commission_amount=commission_amount,
            total_amount=total_amount,
            note=note
        )
        db.session.add(order)
        db.session.flush()

        for item in normalized_items:
            db.session.add(OrderItem(
                order_id=order.id,
                menu_item_id=item["menu_item_id"],
                item_name=item["item_name"],
                unit_price=item["unit_price"],
                quantity=item["quantity"],
                line_total=item["line_total"]
            ))

        db.session.commit()

        payload = order.to_dict(include_items=True)
        payload["restaurant_name"] = restaurant.name
        return jsonify({"status": "success", "order": payload})

    @app.route("/customer/orders", methods=["GET"])
    def get_customer_orders():
        customer_email, error_response = customer_required()
        if error_response:
            return error_response

        orders = Order.query.filter_by(customer_email=customer_email).order_by(Order.created_at.desc()).all()
        return jsonify([
            {
                **order.to_dict(include_items=True),
                "restaurant_name": order.restaurant.name if order.restaurant else None
            }
            for order in orders
        ])


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

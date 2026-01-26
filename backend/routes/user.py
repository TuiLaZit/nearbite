from flask import request, jsonify
from models import Restaurant, Tag, db
from services import calculate_distance, generate_narration
from translate import translate_text
from tts import text_to_speech
from sqlalchemy import and_, or_


def register_user_routes(app):

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
        """Lấy danh sách tất cả tags (public endpoint)"""
        tags = Tag.query.all()
        return jsonify({
            "status": "success",
            "tags": [tag.to_dict() for tag in tags]
        })

    @app.route("/location", methods=["POST"])
    def receive_location():
        if request.method == "OPTIONS":
            return "", 200
        data = request.get_json()
        user_lat = data.get("latitude")
        user_lng = data.get("longitude")
        language = data.get("language", "vi")
        
        print(f"===== LOCATION REQUEST =====")
        print(f"Language: {language}")
        print(f"Position: {user_lat}, {user_lng}")

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
        
        # Message khi chưa đến gần quán
        out_of_range_msg_vi = f'🚶 Bạn hãy tới gần quán "{nearest.name}" để nghe thuyết minh'
        out_of_range_msg = translate_text(out_of_range_msg_vi, language)
        
        print(f"Nearest: {nearest.name}")
        print(f"Distance: {min_dist}")
        print(f"Audio URL: {audio_url}")
        print(f"Language used: {language}")

        return jsonify({
            "status": "success",
            "language": language,
            "narration": narration_final,
            "audio_url": audio_url,
            "distance_km": round(min_dist, 3),
            "nearest_place": nearest.to_dict(include_details=True),
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
            
            # Price fit: ưu tiên quán rẻ hơn (giả sử avg price từ menu)
            avg_price = db.session.query(
                db.func.avg(db.text('price'))
            ).select_from(db.text('menu_item')).filter(
                db.text('restaurant_id = :rid')
            ).params(rid=restaurant.id).scalar() or 50000
            
            if avg_price < budget / 3:
                score += 5
            elif avg_price < budget / 2:
                score += 3
            
            # Time fit: ưu tiên quán gần (tính khoảng cách nếu có vị trí user)
            if user_lat and user_lng:
                distance = calculate_distance(user_lat, user_lng, restaurant.lat, restaurant.lng)
                if distance < 0.5:  # < 500m
                    score += 8
                elif distance < 1:  # < 1km
                    score += 5
                elif distance < 2:  # < 2km
                    score += 2
            
            scored_restaurants.append({
                "restaurant": restaurant,
                "score": score,
                "avg_price": avg_price,
                "matching_tags": matching_tags
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
            # Sắp xếp lại theo khoảng cách
            sorted_by_distance = sorted(
                scored_restaurants,
                key=lambda x: calculate_distance(user_lat, user_lng, x["restaurant"].lat, x["restaurant"].lng)
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
        
        # Đảm bảo trả về đúng 3 tours (nếu ít hơn thì lặp lại)
        while len(tours) < 3 and tours:
            tours.append(tours[0])
        
        return jsonify({
            "status": "success",
            "tours": tours[:3],
            "total_restaurants": len(restaurants)
        })


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
                "address": restaurant.address,
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

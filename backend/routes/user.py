from flask import request, jsonify
from models import Restaurant
from services import calculate_distance, generate_narration
from translate import translate_text
from tts import text_to_speech


def register_user_routes(app):

    @app.route("/restaurants", methods=["GET"])
    def get_restaurants():
        """Lấy danh sách tất cả quán đang active với tags và images"""
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        return jsonify({
            "status": "success",
            "restaurants": [r.to_dict(include_details=True) for r in restaurants]
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

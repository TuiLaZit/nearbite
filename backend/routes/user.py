from flask import request, jsonify
from models import Restaurant
from services import calculate_distance, generate_narration
from translate import translate_text
from tts import text_to_speech


def register_user_routes(app):

    @app.route("/location", methods=["POST"])
    def receive_location():
        if request.method == "OPTIONS":
            return "", 200
        data = request.get_json()
        user_lat = data.get("latitude")
        user_lng = data.get("longitude")

        restaurants = Restaurant.query.filter_by(is_active=True).all()

        nearest = None
        min_dist = float("inf")

        for r in restaurants:
            dist = calculate_distance(user_lat, user_lng, r.lat, r.lng)
            if dist < min_dist:
                min_dist = dist
                nearest = r

        language = data.get("language", "vi")
        narration_vi = generate_narration(nearest, min_dist)
        narration_final = translate_text(narration_vi, language)
        audio_url = text_to_speech(narration_final, language)

        return jsonify({
            "status": "success",
            "language": language,
            "narration": narration_final,
            "audio_url": audio_url,
            "distance_km": round(min_dist, 3),
            "nearest_place": nearest.to_dict()
        })

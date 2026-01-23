from flask import request, jsonify
from models import Restaurant, MenuItem
from db import db
from auth import admin_required
from validators import validate_restaurant,validate_menu_item

def register_admin_routes(app):

    # ======================
    # RESTAURANT CRUD
    # ======================

    @app.route("/admin/restaurants", methods=["GET"])
    @admin_required
    def get_restaurants():
        return jsonify([
            r.to_dict() for r in Restaurant.query.filter_by(is_active=True).all()
        ])

    @app.route("/admin/restaurants", methods=["POST"])
    @admin_required
    def add_restaurant():
        data = request.get_json()

        error = validate_restaurant(data)
        if error:
            return jsonify({"error": error}), 400

        restaurant = Restaurant(
            name=data.get("name"),
            lat=data.get("lat"),
            lng=data.get("lng"),
            description=data.get("description"),
            avg_eat_time=data.get("avg_eat_time")
        )

        db.session.add(restaurant)
        db.session.commit()

        return jsonify({
            "status": "success",
            "restaurant": restaurant.to_dict()
        })

    @app.route("/admin/restaurants/<int:id>", methods=["PUT"])
    @admin_required
    def update_restaurant(id):
        restaurant = Restaurant.query.get_or_404(id)
        data = request.get_json()

        error = validate_restaurant(data)
        if error:
            return jsonify({"error": error}), 400

        restaurant.name = data.get("name", restaurant.name)
        restaurant.lat = data.get("lat", restaurant.lat)
        restaurant.lng = data.get("lng", restaurant.lng)
        restaurant.description = data.get("description", restaurant.description)
        restaurant.avg_eat_time = data.get("avg_eat_time", restaurant.avg_eat_time)

        db.session.commit()

        return jsonify({
            "status": "success",
            "restaurant": restaurant.to_dict()
        })

    @app.route("/admin/restaurants/<int:id>", methods=["DELETE"])
    @admin_required
    def delete_restaurant(id):
        restaurant = Restaurant.query.get_or_404(id)
        data = request.get_json()

        if not data or data.get("confirm_name") != restaurant.name:
            return jsonify({
                "status": "error",
                "message": "Tên quán xác nhận không đúng"
            }), 400

        db.session.delete(restaurant)
        db.session.commit()

        return jsonify({
            "status": "deleted",
            "id": id
        })

    # ======================
    # SOFT DELETE
    # ======================

    @app.route("/admin/restaurants/<int:id>/hide", methods=["PUT"])
    @admin_required
    def hide_restaurant(id):
        restaurant = Restaurant.query.get_or_404(id)
        restaurant.is_active = False
        db.session.commit()
        return jsonify({"status": "hidden"})

    @app.route("/admin/restaurants/<int:id>/restore", methods=["PUT"])
    @admin_required
    def restore_restaurant(id):
        restaurant = Restaurant.query.get_or_404(id)
        restaurant.is_active = True
        db.session.commit()
        return jsonify({"status": "restored"})

    @app.route("/admin/restaurants/hidden", methods=["GET"])
    @admin_required
    def get_hidden_restaurants():
        restaurants = Restaurant.query.filter_by(is_active=False).all()
        return jsonify([r.to_dict() for r in restaurants])

    # ======================
    # MENU CRUD
    # ======================

    @app.route("/admin/restaurants/<int:restaurant_id>/menu", methods=["GET"])
    @admin_required
    def get_menu(restaurant_id):
        restaurant = Restaurant.query.get_or_404(restaurant_id)
        return jsonify([item.to_dict() for item in restaurant.menu_items])

    @app.route("/admin/restaurants/<int:restaurant_id>/menu", methods=["POST"])
    @admin_required
    def add_menu_item(restaurant_id):
        Restaurant.query.get_or_404(restaurant_id)
        data = request.get_json()

        error = validate_menu_item(data)
        if error:
            return jsonify({"error": error}), 400

        item = MenuItem(
            name=data.get("name"),
            price=data.get("price"),
            restaurant_id=restaurant_id
        )

        db.session.add(item)
        db.session.commit()

        return jsonify({
            "status": "success",
            "item": item.to_dict()
        })

    @app.route("/admin/menu/<int:id>", methods=["PUT"])
    @admin_required
    def update_menu_item(id):
        item = MenuItem.query.get_or_404(id)
        data = request.get_json()

        error = validate_menu_item(data)
        if error:
            return jsonify({"error": error}), 400

        item.name = data.get("name", item.name)
        item.price = data.get("price", item.price)

        db.session.commit()

        return jsonify({
            "status": "success",
            "item": item.to_dict()
        })

    @app.route("/admin/menu/<int:id>", methods=["DELETE"])
    @admin_required
    def delete_menu_item(id):
        item = MenuItem.query.get_or_404(id)
        db.session.delete(item)
        db.session.commit()

        return jsonify({
            "status": "deleted",
            "id": id
        })

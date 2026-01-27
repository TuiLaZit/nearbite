from flask import request, jsonify
from models import Restaurant, MenuItem, Tag, RestaurantImage, restaurant_tags, LocationVisit
from db import db
from auth import admin_required
from validators import validate_restaurant, validate_menu_item, validate_tag, validate_restaurant_image
from supabase_client import upload_image, delete_image, supabase_client
import uuid
from datetime import datetime
from sqlalchemy import func

def register_admin_routes(app):

    # ======================
    # RESTAURANT CRUD
    # ======================

    @app.route("/admin/restaurants", methods=["GET"])
    @admin_required
    def get_restaurants_admin():
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
            avg_eat_time=data.get("avg_eat_time"),
            poi_radius_km=data.get("poi_radius_km", 0.015)  # Default 15m if not provided
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
        restaurant.poi_radius_km = data.get("poi_radius_km", restaurant.poi_radius_km)

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

        # Check if this is a permanent delete request (from hidden list)
        if data and data.get("permanent") == True:
            # Permanent delete - remove everything
            db.session.delete(restaurant)
            db.session.commit()
            return jsonify({
                "status": "permanently_deleted",
                "id": id
            })
        
        # Otherwise, soft delete (hide the restaurant)
        restaurant.is_active = False
        db.session.commit()

        return jsonify({
            "status": "hidden",
            "id": id
        })

    # ======================
    # SOFT DELETE / RESTORE
    # ======================

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

    # ======================
    # TAG CRUD
    # ======================

    @app.route("/admin/tags", methods=["GET"])
    @admin_required
    def get_all_tags():
        """Get all tags"""
        tags = Tag.query.all()
        return jsonify([tag.to_dict() for tag in tags])

    @app.route("/admin/tags", methods=["POST"])
    @admin_required
    def create_tag():
        """Create a new tag"""
        data = request.get_json()
        
        # Validate data
        error = validate_tag(data)
        if error:
            return jsonify({"error": error}), 400
        
        # Check if tag name already exists
        existing_tag = Tag.query.filter_by(name=data.get("name")).first()
        if existing_tag:
            return jsonify({"error": "Tag với tên này đã tồn tại"}), 400
        
        tag = Tag(
            name=data.get("name"),
            icon=data.get("icon"),
            color=data.get("color"),
            description=data.get("description")
        )
        
        db.session.add(tag)
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "tag": tag.to_dict()
        })

    @app.route("/admin/tags/<int:id>", methods=["PUT"])
    @admin_required
    def update_tag(id):
        """Update a tag"""
        tag = Tag.query.get_or_404(id)
        data = request.get_json()
        
        # Validate data
        error = validate_tag(data)
        if error:
            return jsonify({"error": error}), 400
        
        # Check if new name conflicts with existing tag
        if data.get("name") != tag.name:
            existing_tag = Tag.query.filter_by(name=data.get("name")).first()
            if existing_tag:
                return jsonify({"error": "Tag với tên này đã tồn tại"}), 400
        
        tag.name = data.get("name", tag.name)
        tag.icon = data.get("icon", tag.icon)
        tag.color = data.get("color", tag.color)
        tag.description = data.get("description", tag.description)
        
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "tag": tag.to_dict()
        })

    @app.route("/admin/tags/<int:id>", methods=["DELETE"])
    @admin_required
    def delete_tag(id):
        """Delete a tag"""
        tag = Tag.query.get_or_404(id)
        db.session.delete(tag)
        db.session.commit()
        
        return jsonify({
            "status": "deleted",
            "id": id
        })

    # ======================
    # RESTAURANT TAGS
    # ======================

    @app.route("/admin/restaurants/<int:restaurant_id>/tags", methods=["GET"])
    @admin_required
    def get_restaurant_tags(restaurant_id):
        """Get all tags for a restaurant"""
        restaurant = Restaurant.query.get_or_404(restaurant_id)
        return jsonify([tag.to_dict() for tag in restaurant.tags])

    @app.route("/admin/restaurants/<int:restaurant_id>/tags/<int:tag_id>", methods=["POST"])
    @admin_required
    def add_tag_to_restaurant(restaurant_id, tag_id):
        """Add a tag to a restaurant"""
        restaurant = Restaurant.query.get_or_404(restaurant_id)
        tag = Tag.query.get_or_404(tag_id)
        
        if tag not in restaurant.tags:
            restaurant.tags.append(tag)
            db.session.commit()
            return jsonify({
                "status": "success",
                "message": "Tag đã được thêm vào quán"
            })
        else:
            return jsonify({
                "status": "already_exists",
                "message": "Quán đã có tag này rồi"
            })

    @app.route("/admin/restaurants/<int:restaurant_id>/tags/<int:tag_id>", methods=["DELETE"])
    @admin_required
    def remove_tag_from_restaurant(restaurant_id, tag_id):
        """Remove a tag from a restaurant"""
        restaurant = Restaurant.query.get_or_404(restaurant_id)
        tag = Tag.query.get_or_404(tag_id)
        
        if tag in restaurant.tags:
            restaurant.tags.remove(tag)
            db.session.commit()
            return jsonify({
                "status": "success",
                "message": "Tag đã được gỡ khỏi quán"
            })
        else:
            return jsonify({
                "status": "not_found",
                "message": "Quán không có tag này"
            }), 404

    # ======================
    # RESTAURANT IMAGES
    # ======================

    @app.route("/admin/restaurants/<int:restaurant_id>/images", methods=["GET"])
    @admin_required
    def get_restaurant_images(restaurant_id):
        """Get all images for a restaurant"""
        restaurant = Restaurant.query.get_or_404(restaurant_id)
        return jsonify([img.to_dict() for img in restaurant.images])

    @app.route("/admin/restaurants/<int:restaurant_id>/images", methods=["POST"])
    @admin_required
    def add_restaurant_image(restaurant_id):
        """Add an image to a restaurant"""
        Restaurant.query.get_or_404(restaurant_id)
        data = request.get_json()
        
        # Validate data
        error = validate_restaurant_image(data)
        if error:
            return jsonify({"error": error}), 400
        
        # If this is set as primary, unset other primary images
        if data.get("is_primary"):
            RestaurantImage.query.filter_by(
                restaurant_id=restaurant_id,
                is_primary=True
            ).update({"is_primary": False})
        
        image = RestaurantImage(
            restaurant_id=restaurant_id,
            image_url=data.get("image_url"),
            caption=data.get("caption"),
            display_order=data.get("display_order", 0),
            is_primary=data.get("is_primary", False)
        )
        
        db.session.add(image)
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "image": image.to_dict()
        })

    @app.route("/admin/images/<int:id>", methods=["PUT"])
    @admin_required
    def update_restaurant_image(id):
        """Update an image"""
        image = RestaurantImage.query.get_or_404(id)
        data = request.get_json()
        
        # Validate data if URL is being changed
        if data.get("image_url") and data["image_url"] != image.image_url:
            error = validate_restaurant_image(data)
            if error:
                return jsonify({"error": error}), 400
        
        # If setting as primary, unset other primary images for this restaurant
        if data.get("is_primary") and not image.is_primary:
            RestaurantImage.query.filter_by(
                restaurant_id=image.restaurant_id,
                is_primary=True
            ).update({"is_primary": False})
        
        image.image_url = data.get("image_url", image.image_url)
        image.caption = data.get("caption", image.caption)
        image.display_order = data.get("display_order", image.display_order)
        image.is_primary = data.get("is_primary", image.is_primary)
        
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "image": image.to_dict()
        })

    @app.route("/admin/images/<int:id>", methods=["DELETE"])
    @admin_required
    def delete_restaurant_image(id):
        """Delete an image"""
        image = RestaurantImage.query.get_or_404(id)
        db.session.delete(image)
        db.session.commit()
        
        return jsonify({
            "status": "deleted",
            "id": id
        })

    # ======================
    # RESTAURANT DETAILS (Combined endpoint)
    # ======================

    @app.route("/admin/restaurants/<int:id>/details", methods=["GET"])
    @admin_required
    def get_restaurant_details(id):
        """Get complete restaurant details including menu, tags, and images"""
        restaurant = Restaurant.query.get_or_404(id)
        return jsonify(restaurant.to_dict(include_details=True))

    # ======================
    # IMAGE UPLOAD
    # ======================

    @app.route("/admin/upload-image", methods=["POST"])
    @admin_required
    def upload_restaurant_image_file():
        """Upload image file to Supabase Storage and return URL"""
        if not supabase_client:
            return jsonify({
                "error": "Image upload is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"
            }), 500
        
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Check file type
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        file_ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        
        if file_ext not in allowed_extensions:
            return jsonify({
                "error": f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
            }), 400
        
        try:
            # Generate unique filename
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            unique_id = str(uuid.uuid4())[:8]
            filename = f"{timestamp}_{unique_id}.{file_ext}"
            
            # Read file bytes
            file_bytes = file.read()
            
            # Upload to Supabase
            public_url = upload_image(file_bytes, filename)
            
            return jsonify({
                "status": "success",
                "url": public_url,
                "filename": filename
            })
        
        except Exception as e:
            return jsonify({
                "error": f"Failed to upload image: {str(e)}"
            }), 500


    # ======================
    # HEATMAP & ANALYTICS
    # ======================

    @app.route("/admin/heatmap", methods=["GET"])
    @admin_required
    def get_heatmap_data():
        """Get heatmap data for admin dashboard"""
        try:
            # Get all location visits where duration >= 60 seconds
            visits = LocationVisit.query.filter(LocationVisit.duration_seconds >= 60).all()
            
            # Aggregate data by location (rounded to 5 decimal places for clustering)
            heatmap_data = {}
            for visit in visits:
                # Round to create clusters
                lat_key = round(visit.lat, 5)
                lng_key = round(visit.lng, 5)
                key = (lat_key, lng_key)
                
                if key not in heatmap_data:
                    heatmap_data[key] = {
                        "lat": lat_key,
                        "lng": lng_key,
                        "intensity": 0
                    }
                heatmap_data[key]["intensity"] += 1
            
            return jsonify(list(heatmap_data.values()))
        except Exception as e:
            print(f"Error in get_heatmap_data: {str(e)}")
            # Return empty array if table doesn't exist yet
            return jsonify([])

    @app.route("/admin/restaurants/analytics", methods=["GET"])
    @admin_required
    def get_restaurants_analytics():
        """Get restaurants with analytics data for management page"""
        search = request.args.get('search', '').strip()
        tag_ids = request.args.getlist('tags')
        sort_by = request.args.get('sort', 'name')  # name, visit_count, avg_visit_duration, avg_audio_duration
        
        query = Restaurant.query.filter_by(is_active=True)
        
        # Search by name
        if search:
            query = query.filter(Restaurant.name.ilike(f'%{search}%'))
        
        # Filter by tags
        if tag_ids:
            query = query.join(Restaurant.tags).filter(Tag.id.in_(tag_ids))
        
        # Sorting
        if sort_by == 'visit_count':
            query = query.order_by(Restaurant.visit_count.desc())
        elif sort_by == 'avg_visit_duration':
            query = query.order_by(Restaurant.avg_visit_duration.desc())
        elif sort_by == 'avg_audio_duration':
            query = query.order_by(Restaurant.avg_audio_duration.desc())
        else:
            query = query.order_by(Restaurant.name)
        
        restaurants = query.all()
        return jsonify([r.to_dict(include_details=True) for r in restaurants])



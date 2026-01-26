def is_number(value):
    return isinstance(value, (int, float))


def validate_restaurant(data):
    if not data.get("name"):
        return "Tên quán không được để trống"

    if not is_number(data.get("lat")) or not (-90 <= data["lat"] <= 90):
        return "Latitude không hợp lệ"

    if not is_number(data.get("lng")) or not (-180 <= data["lng"] <= 180):
        return "Longitude không hợp lệ"

    if not isinstance(data.get("avg_eat_time"), int) or data["avg_eat_time"] <= 0:
        return "Thời gian ăn phải là số nguyên > 0"
    
    # Validate poi_radius_km if provided
    if "poi_radius_km" in data:
        if not is_number(data.get("poi_radius_km")):
            return "Bán kính POI phải là số"
        if data["poi_radius_km"] <= 0 or data["poi_radius_km"] > 1:
            return "Bán kính POI phải từ 0 đến 1 km (0-1000m)"

    return None


def validate_menu_item(data):
    if not data.get("name"):
        return "Tên món không được để trống"

    if not isinstance(data.get("price"), int) or data["price"] <= 0:
        return "Giá món phải là số nguyên > 0"

    return None


def validate_tag(data):
    """Validate tag data"""
    if not data.get("name"):
        return "Tên tag không được để trống"
    
    if len(data["name"]) > 50:
        return "Tên tag không được quá 50 ký tự"
    
    # Icon is optional but if provided, should not be too long
    if data.get("icon") and len(data["icon"]) > 20:
        return "Icon không được quá 20 ký tự"
    
    # Color is optional but if provided, should be valid hex
    if data.get("color"):
        color = data["color"].strip()
        if not (color.startswith("#") and len(color) in [4, 7]):
            return "Màu sắc phải ở định dạng hex (#RGB hoặc #RRGGBB)"
    
    return None


def validate_restaurant_image(data):
    """Validate restaurant image data"""
    if not data.get("image_url"):
        return "URL hình ảnh không được để trống"
    
    # Basic URL validation
    url = data["image_url"].strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        return "URL hình ảnh phải bắt đầu bằng http:// hoặc https://"
    
    # Display order should be non-negative integer
    display_order = data.get("display_order", 0)
    if not isinstance(display_order, int) or display_order < 0:
        return "Thứ tự hiển thị phải là số nguyên >= 0"
    
    return None

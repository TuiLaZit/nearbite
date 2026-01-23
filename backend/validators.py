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

    return None


def validate_menu_item(data):
    if not data.get("name"):
        return "Tên món không được để trống"

    if not isinstance(data.get("price"), int) or data["price"] <= 0:
        return "Giá món phải là số nguyên > 0"

    return None

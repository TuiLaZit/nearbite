import math

def calculate_distance(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = math.sin(dlat / 2)**2 + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dlng / 2)**2

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def generate_narration(restaurant, distance_km):
    menu_items = restaurant.menu_items[:3]

    if menu_items:
        menu_names = ", ".join([m.name for m in menu_items])
        menu_text = f"Quán có các món tiêu biểu như {menu_names}."
    else:
        menu_text = "Quán có thực đơn đa dạng."

    return (
        f"{restaurant.name}. "
        f"{restaurant.description}. "
        f"{menu_text} "
    )

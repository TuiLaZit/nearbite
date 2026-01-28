from db import db
from datetime import datetime

# Association table for many-to-many relationship between Restaurant and Tag
restaurant_tags = db.Table('restaurant_tag',
    db.Column('id', db.Integer, primary_key=True),
    db.Column('restaurant_id', db.Integer, db.ForeignKey('restaurant.id'), nullable=False),
    db.Column('tag_id', db.Integer, db.ForeignKey('tag.id'), nullable=False),
    db.UniqueConstraint('restaurant_id', 'tag_id', name='unique_restaurant_tag')
)

class Restaurant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text)
    avg_eat_time = db.Column(db.Integer)
    poi_radius_km = db.Column(db.Float, default=0.030, nullable=False)  # POI activation radius in km (default 30m)
    is_active = db.Column(db.Boolean, default=True)
    
    # Analytics fields
    visit_count = db.Column(db.Integer, default=0)  # Số lần ghé
    avg_visit_duration = db.Column(db.Integer, default=0)  # Thời gian ghé trung bình (giây)
    avg_audio_duration = db.Column(db.Integer, default=0)  # Thời gian nghe trung bình (giây)
    audio_play_count = db.Column(db.Integer, default=0)  # Số lần phát audio

    menu_items = db.relationship(
        "MenuItem",
        backref="restaurant",
        cascade="all, delete-orphan",
        lazy=True
    )
    
    tags = db.relationship(
        "Tag",
        secondary=restaurant_tags,
        backref=db.backref("restaurants", lazy=True),
        lazy=True
    )
    
    images = db.relationship(
        "RestaurantImage",
        backref="restaurant",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="RestaurantImage.display_order"
    )

    def to_dict(self, include_details=False):
        result = {
            "id": self.id,
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "description": self.description,
            "avg_eat_time": self.avg_eat_time,
            "poi_radius_km": self.poi_radius_km,
            "is_active": self.is_active,
            "visit_count": self.visit_count,
            "avg_visit_duration": self.avg_visit_duration,
            "avg_audio_duration": self.avg_audio_duration,
            "audio_play_count": self.audio_play_count
        }
        
        if include_details:
            result["menu"] = [item.to_dict() for item in self.menu_items]
            result["tags"] = [tag.to_dict() for tag in self.tags]
            result["images"] = [img.to_dict() for img in self.images]
        else:
            result["menu"] = [item.to_dict() for item in self.menu_items]
            
        return result


class MenuItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    restaurant_id = db.Column(db.Integer, db.ForeignKey("restaurant.id"))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "price": self.price
        }


class Tag(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    icon = db.Column(db.String(20))
    color = db.Column(db.String(20))
    description = db.Column(db.Text)
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "icon": self.icon,
            "color": self.color,
            "description": self.description
        }


class RestaurantImage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey("restaurant.id"), nullable=False)
    image_url = db.Column(db.Text, nullable=False)
    caption = db.Column(db.Text)
    display_order = db.Column(db.Integer, default=0)
    
    def to_dict(self):
        return {
            "id": self.id,
            "restaurant_id": self.restaurant_id,
            "image_url": self.image_url,
            "caption": self.caption,
            "display_order": self.display_order
        }


# Model for tracking user location visits (for heatmap)
class LocationVisit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    duration_seconds = db.Column(db.Integer, nullable=False)  # Thời gian ở vị trí (giây)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    restaurant_id = db.Column(db.Integer, db.ForeignKey("restaurant.id"), nullable=True)  # Nullable for general visits
    
    def to_dict(self):
        return {
            "id": self.id,
            "lat": self.lat,
            "lng": self.lng,
            "duration_seconds": self.duration_seconds,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "restaurant_id": self.restaurant_id
        }
    is_primary = db.Column(db.Boolean, default=False)
    
    def to_dict(self):
        return {
            "id": self.id,
            "restaurant_id": self.restaurant_id,
            "image_url": self.image_url,
            "caption": self.caption,
            "display_order": self.display_order,
            "is_primary": self.is_primary
        }

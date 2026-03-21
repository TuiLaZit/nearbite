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
    owner_username = db.Column(db.String(64), unique=True, nullable=True)
    owner_password_hash = db.Column(db.String(255), nullable=True)
    owner_password_plain = db.Column(db.String(32), nullable=True)
    
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

    orders = db.relationship(
        "Order",
        backref="restaurant",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="desc(Order.created_at)"
    )

    def to_dict(self, include_details=False, include_admin_fields=False):
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

        if include_admin_fields:
            result["owner_username"] = self.owner_username
            result["owner_password_plain"] = self.owner_password_plain
            result["has_account"] = bool(self.owner_username and self.owner_password_hash)
        
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
    __tablename__ = 'restaurant_image'
    
    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey("restaurant.id"), nullable=False)
    image_url = db.Column(db.Text, nullable=False)
    caption = db.Column(db.Text)
    display_order = db.Column(db.Integer, default=0)
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


class AdminUser(db.Model):
    __tablename__ = 'admin_user'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Order(db.Model):
    __tablename__ = 'customer_order'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey("restaurant.id"), nullable=False)
    customer_email = db.Column(db.String(255), nullable=False)
    order_type = db.Column(db.String(20), nullable=False)  # delivery | pickup
    delivery_address = db.Column(db.Text)
    payment_method = db.Column(db.String(30), nullable=False)  # online_demo | cod
    payment_status = db.Column(db.String(30), nullable=False)  # paid_demo | pending_cod
    payment_transaction_id = db.Column(db.String(100))
    order_status = db.Column(db.String(30), nullable=False, default="pending")
    subtotal_amount = db.Column(db.Integer, nullable=False)
    commission_rate = db.Column(db.Float, nullable=False)
    commission_amount = db.Column(db.Integer, nullable=False)
    total_amount = db.Column(db.Integer, nullable=False)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    items = db.relationship(
        "OrderItem",
        backref="order",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="OrderItem.id"
    )

    def to_dict(self, include_items=True):
        payload = {
            "id": self.id,
            "restaurant_id": self.restaurant_id,
            "customer_email": self.customer_email,
            "order_type": self.order_type,
            "delivery_address": self.delivery_address,
            "payment_method": self.payment_method,
            "payment_status": self.payment_status,
            "payment_transaction_id": self.payment_transaction_id,
            "order_status": self.order_status,
            "subtotal_amount": self.subtotal_amount,
            "commission_rate": self.commission_rate,
            "commission_amount": self.commission_amount,
            "total_amount": self.total_amount,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

        if include_items:
            payload["items"] = [item.to_dict() for item in self.items]

        return payload


class OrderItem(db.Model):
    __tablename__ = 'customer_order_item'

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("customer_order.id"), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_item.id"), nullable=True)
    item_name = db.Column(db.String(150), nullable=False)
    unit_price = db.Column(db.Integer, nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    line_total = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "menu_item_id": self.menu_item_id,
            "item_name": self.item_name,
            "unit_price": self.unit_price,
            "quantity": self.quantity,
            "line_total": self.line_total
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

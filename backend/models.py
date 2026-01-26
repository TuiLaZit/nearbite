from db import db

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
    is_active = db.Column(db.Boolean, default=True)

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
            "is_active": self.is_active
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
